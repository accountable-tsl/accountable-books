import "./Button.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

interface ButtonProps {
  variant?: "solid" | "outlined" | "text";
  color?: "primary" | "secondary" | "success" | "danger";
  icon?: IconDefinition | string | JSX.Element; // Supports FontAwesome or JSX elements
  iconPosition?: "left" | "right";
  disabled?: boolean;
  onClick?: () => void;
  customClass?: string;
  text?: string;
}

const Button: React.FC<ButtonProps> = ({
  variant = "solid",
  color = "primary",
  icon,
  iconPosition = "left",
  disabled = false,
  onClick = () => {},
  customClass = "",
  text = "Submit",
}) => {
  const className = `button button__${variant} button__${variant}--${color} ${
    icon && !text ? "button--icon-only" : ""
  } ${customClass}`;

  const isImageIcon = (icon: string) => {
    const imageExtensions = [".png", ".svg", ".jpg", ".jpeg", ".gif"];
    return imageExtensions.some((ext) => icon.endsWith(ext));
  };

  return (
    <button
      className={className}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      {icon && iconPosition === "left" && (
        <span className="button__icon-left">
          {typeof icon === "string" && isImageIcon(icon) ? (
            <img src={icon} alt="button-icon" className="button__img-icon" />
          ) : (
            <FontAwesomeIcon icon={icon as IconDefinition} />
          )}
        </span>
      )}
      {text && <span>{text}</span>}
      {icon && iconPosition === "right" && (
        <span className="button__icon-right">
          {typeof icon === "string" && isImageIcon(icon) ? (
            <img src={icon} alt="button-icon" className="button__img-icon" />
          ) : (
            <FontAwesomeIcon icon={icon as IconDefinition} />
          )}
        </span>
      )}
    </button>
  );
};

export default Button;
