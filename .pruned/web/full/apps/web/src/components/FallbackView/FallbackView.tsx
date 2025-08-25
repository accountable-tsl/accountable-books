import './FallbackView.scss';

type FallbackViewType = 'default' | 'notFound' | 'unauthorized' | 'noData' | 'screenSize';

interface FallbackViewProps {
  type?: FallbackViewType;
  customMessage?: string;
  supportEmail?: string;
  customClass?: string;
}

interface FallbackViewErrorTypes {
  [key: string]: {
    icon: string | JSX.Element;
    title: string;
    message: string;
  };
}
export default function FallbackView({
  type = 'default',
  customMessage = '',
  supportEmail = 'hello@accountable.global',
  customClass = '',
}: FallbackViewProps) {
  const errorTypes: FallbackViewErrorTypes = {
    default: {
      icon: '🤷',
      title: 'Oops! Something went wrong.',
      message: "We're sorry, but something went wrong. Please try again later.",
    },
    notFound: {
      icon: '🔍',
      title: 'Page not found.',
      message: 'The page you are looking for does not exist.',
    },
    unauthorized: {
      icon: '🔒',
      title: 'Unauthorized access.',
      message: 'You are not authorized to access this page.',
    },
    noData: {
      icon: '📊',
      title: 'No data available.',
      message: 'There is no data available for this page.',
    },
    screenSize: {
      icon: '📱',
      title: 'Screen size not supported.',
      message: 'Please use a larger screen to view this page.',
    },
  };

  const config = errorTypes[type] || errorTypes.default;

  return (
    <div className={`fbv fbv-${type} ${customClass}`}>
      <div className="fbv-icon">{config.icon}</div>
      <div className="fbv-title">{config.title}</div>
      <p className="fbv-message">{customMessage ? customMessage : config.message}</p>
      {type !== 'screenSize' && (
        <div>
          <button onClick={() => (window.location.href = '/')}>Return to Home</button>
          <p className="fbv-support">
            If you believe this is an error, please contact{' '}
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
          </p>
        </div>
      )}
    </div>
  );
}
