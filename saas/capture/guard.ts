// The guard of the cloud capture: the service opens addresses its users type, so nothing it fetches may reach its own
// machine, the cloud's metadata service or a private network (SSRF). Every name is resolved here and each address
// checked; the browser goes through the guard proxy, which connects to the address it checked (a name that resolves
// to a public address on the check and a private one on the connection gets no second lookup).
import { BlockList, connect, isIP, type Socket } from 'node:net';
import { lookup } from 'node:dns/promises';
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]] as const) blocked.addSubnet(net, prefix, 'ipv6');

export function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    // an IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as the IPv4 one
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped?.[1]) return !blocked.check(mapped[1], 'ipv4');
    return !blocked.check(address, 'ipv6');
  }
  return !blocked.check(address, 'ipv4');
}

const PORTS = new Set([80, 443, 8080, 8443]);

// the public address a host name stands for, or null when it has none or any of its addresses is private
export async function resolvePublic(host: string): Promise<string | null> {
  const name = host.replace(/^\[|\]$/g, '');
  if (isIP(name) !== 0) return publicAddress(name) ? name : null;
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.internal') || name.endsWith('.local')) return null;
  try {
    const all = await lookup(name, { all: true, verbatim: true });
    if (all.length === 0 || all.some((one) => !publicAddress(one.address))) return null;
    return all[0]?.address ?? null;
  } catch {
    return null;
  }
}

export async function allowedUrl(url: string): Promise<boolean> {
  try {
    const at = new URL(url);
    if (at.protocol !== 'http:' && at.protocol !== 'https:') return false;
    const port = Number(at.port || (at.protocol === 'https:' ? 443 : 80));
    if (!PORTS.has(port)) return false;
    return (await resolvePublic(at.hostname)) !== null;
  } catch {
    return false;
  }
}

// The proxy the browser is launched behind (127.0.0.1 only): CONNECT for https, absolute URLs for http.
export function startGuardProxy(port = 0): Promise<Server & { readonly url: string }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      let target: URL;
      try {
        target = new URL(req.url ?? '');
      } catch {
        res.writeHead(400).end();
        return;
      }
      const port = Number(target.port || 80);
      const address = target.protocol === 'http:' && PORTS.has(port) ? await resolvePublic(target.hostname) : null;
      if (address === null) {
        res.writeHead(403).end('blocked');
        return;
      }
      const upstream = httpRequest(
        { host: address, port, method: req.method, path: `${target.pathname}${target.search}`, headers: { ...req.headers, host: target.host }, timeout: 30_000 },
        (answer) => {
          res.writeHead(answer.statusCode ?? 502, answer.headers);
          answer.pipe(res);
        },
      );
      upstream.on('error', () => res.writeHead(502).end());
      req.pipe(upstream);
    })();
  });
  server.on('connect', (req: IncomingMessage, client: Socket, head: Buffer) => {
    void (async () => {
      const [host = '', portText = '443'] = (req.url ?? '').split(/:(?=\d+$)/);
      const port = Number(portText);
      const address = PORTS.has(port) ? await resolvePublic(host) : null;
      if (address === null) {
        client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }
      const upstream = connect(port, address, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length > 0) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.setTimeout(60_000, () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
    })();
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const at = server.address();
    resolve(Object.assign(server, { url: `http://127.0.0.1:${typeof at === 'object' && at !== null ? at.port : port}` }));
  }));
}
