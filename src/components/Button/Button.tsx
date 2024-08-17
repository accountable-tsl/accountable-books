import "./Button.scss";
import { cva } from "class-variance-authority";

const buttonStyles = cva("button", {
  variants: {
    variant: {
      solid: "button__solid",
      outlined: "button__outlined",
      text: "button__text",
    },
    color: {
      primary: "button--primary",
      secondary: "button--secondary",
      success: "button--success",
      danger: "button--danger",
    },
    iconPosition: {
      left: "button__icon-left",
      right: "button__icon-right",
    },
    disabled: {
      true: "button__disabled",
      false: "",
    },
  },
  defaultVariants: {
    variant: "solid",
    color: "primary",
    iconPosition: "left",
    disabled: false,
  },
});

interface ButtonProps {
  variant?: "text" | "outlined" | "solid";
  color?: "primary" | "secondary" | "success" | "danger";
  icon?: string | JSX.Element;
  iconPosition?: "left" | "right";
  disabled?: boolean;
  onClick?: () => void;
  customClass?: string;
  children?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant,
  color,
  icon,
  iconPosition,
  disabled,
  onClick = () => {}, // default to empty function
  customClass,
  children,
}) => {
  const className = `${buttonStyles({
    variant,
    color,
    iconPosition,
    disabled,
  })} ${customClass || ""}`;

  return (
    <button className={className} onClick={onClick} disabled={disabled}>
      {icon && iconPosition === "left" && (
        <span className="button__icon-left">{icon}</span>
      )}
      {children}
      {icon && iconPosition === "right" && (
        <span className="button__icon-right">{icon}</span>
      )}
    </button>
  );
};

export default Button;
