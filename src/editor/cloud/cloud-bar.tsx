// The cloud bar, at the end of the top bar in cloud mode (src/editor/cloud/cloud.ts): whether the project is saved in
// the cloud, Publish (a small form for the site's address, then the published link) and the way back to the dashboard.
// Its controls are local: none writes the document.
import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { message } from '../../core/commands/registry.ts';
import type { MessageId } from '../../generated/ids.ts';
import { Icon } from '../doors/door.tsx';
import { Popover, usePopover } from '../shell/popover.tsx';
import { useStore } from '../store.ts';
import { useT } from '../text.ts';
import { CLOUD_SAVE_TEXT, cloudState, dashboardUrl, keepCloudVersion, publishCloud, slugFrom, validSlug } from './cloud.ts';

// the publish function's refusals the person can act on, in their words; any other is the generic failure
const REFUSALS: Readonly<Record<string, MessageId>> = {
  slug_taken: 'cloud.publish.slugTaken',
  invalid_slug: 'cloud.publish.slugInvalid',
  plan_limit_sites: 'cloud.publish.planLimit',
  forbidden: 'cloud.publish.forbidden',
};

export function CloudBar() {
  const t = useT();
  const store = useStore();
  const cloud = useSyncExternalStore(cloudState.subscribe, cloudState.get);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = usePopover(trigger);
  const [slug, setSlug] = useState('');
  const [refusal, setRefusal] = useState<MessageId | null>(null);
  if (cloud.project === null) return null;
  const project = cloud.project;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chosen = slug.trim().toLowerCase();
    if (!validSlug(chosen)) {
      setRefusal('cloud.publish.slugInvalid');
      return;
    }
    setRefusal(null);
    publishCloud(store.getState().document, chosen).then(
      () => store.notice(message('cloud.publish.done')),
      (error: unknown) => setRefusal(REFUSALS[error instanceof Error ? error.message : ''] ?? 'cloud.publish.failed'),
    );
  };
  return (
    <div className="cloud-bar">
      <span className={`cloud-bar__save cloud-bar__save--${cloud.save}`} role="status" title={cloud.error ?? undefined}>
        <Icon name={cloud.save === 'saved' ? 'check' : cloud.save === 'saving' ? 'upload' : 'triangle-alert'} size="sm" />
        {t(CLOUD_SAVE_TEXT[cloud.save])}
      </span>
      {cloud.save === 'conflict' ? (
        <>
          <button type="button" className="door door--button" data-local="cloud-reload" title={t('cloud.save.reloadHint')} onClick={() => window.location.reload()}>
            {t('cloud.save.reload')}
          </button>
          <button type="button" className="door door--button" data-local="cloud-keep-mine" title={t('cloud.save.keepMineHint')} onClick={keepCloudVersion}>
            {t('cloud.save.keepMine')}
          </button>
        </>
      ) : null}
      <button
        ref={trigger}
        type="button"
        className="door door--primary cloud-bar__publish"
        data-local="cloud-publish"
        aria-expanded={popover.open}
        disabled={cloud.publishing}
        onClick={() => {
          setSlug(project.site?.slug ?? slugFrom(project.name));
          setRefusal(null);
          popover.setOpen((was) => !was);
        }}
      >
        <Icon name="globe" size="sm" />
        {t(cloud.publishing ? 'cloud.publish.busy' : 'cloud.publish.open')}
      </button>
      <a className="door door--button" href={dashboardUrl()} data-local="cloud-dashboard" title={t('cloud.dashboard.hint')}>
        <Icon name="layout-dashboard" size="sm" />
        {t('cloud.dashboard')}
      </a>
      {popover.open ? (
        <Popover anchor={trigger} className="cloud-publish" label={t('cloud.publish.title')} as="form" onSubmit={submit} onDismiss={() => popover.setOpen(false)}>
          <label className="cloud-publish__label" htmlFor="cloud-publish-slug">
            {t('cloud.publish.address')}
          </label>
          <div className="cloud-publish__address">
            <input
              id="cloud-publish-slug"
              className="input"
              data-local="cloud-publish-slug"
              value={slug}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={refusal !== null}
              onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            />
            <span className="cloud-publish__suffix">.{new URL(cloud.published ?? `https://x.${import.meta.env.VITE_SITES_DOMAIN ?? 'site'}`).hostname.split('.').slice(1).join('.')}</span>
          </div>
          {refusal !== null ? (
            <p className="cloud-publish__refusal" role="alert">
              {t(refusal)}
            </p>
          ) : null}
          {cloud.published !== null ? (
            <a className="cloud-publish__link" href={cloud.published} target="_blank" rel="noreferrer" data-local="cloud-published-link">
              {cloud.published}
            </a>
          ) : (
            <p className="cloud-publish__hint">{t('cloud.publish.hint')}</p>
          )}
          <button type="submit" className="door door--primary" data-local="cloud-publish-confirm" disabled={cloud.publishing}>
            {t(cloud.publishing ? 'cloud.publish.busy' : cloud.published !== null ? 'cloud.publish.update' : 'cloud.publish.confirm')}
          </button>
        </Popover>
      ) : null}
    </div>
  );
}
