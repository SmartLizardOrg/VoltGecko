import { Component, Suspense, useRef, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { t } from '../i18n';
import { useFocusTrap } from './useFocusTrap';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  errorClassName?: string;
  onClose?: () => void;
}

function FeatureStatus({ failed = false, onClose }: { failed?: boolean; onClose?: () => void }) {
  const region = useRef<HTMLDivElement>(null);
  useFocusTrap(region, onClose ? 'feature-status' : null);
  const message = failed ? t('A nézet nem tölthető be. A folytatáshoz töltsd újra az oldalt.') : t('Betöltés…');
  return (
    <div
      ref={region}
      className={onClose ? 'busy-overlay' : 'empty'}
      role={onClose ? 'dialog' : failed ? 'alert' : 'status'}
      aria-label={message}
      aria-modal={onClose ? true : undefined}
      tabIndex={-1}
    >
      {!failed && <LoaderCircle className="spin" />}
      <p>{message}</p>
      {failed && (
        <button className="primary" onClick={() => location.reload()}>
          {t('Újratöltés')}
        </button>
      )}
      {onClose && (
        <button className="quiet" onClick={onClose}>
          {t('Mégse')}
        </button>
      )}
    </div>
  );
}

/** A failed optional download must leave the workspace and autosave mounted. */
export class LazyFeature extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      const status = <FeatureStatus failed onClose={this.props.onClose} />;
      return this.props.errorClassName ? <div className={this.props.errorClassName}>{status}</div> : status;
    }
    const fallback =
      this.props.fallback === undefined ? <FeatureStatus onClose={this.props.onClose} /> : this.props.fallback;
    return <Suspense fallback={fallback}>{this.props.children}</Suspense>;
  }
}
