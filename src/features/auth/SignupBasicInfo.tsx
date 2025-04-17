import { Input } from "@/components/ui/input";
import { NewUser } from "./SignupTypes";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter/PasswordStrengthMeter";
import { typeToFlattenedError } from "zod";
import { zEmail } from "@/types/types";
import { usePasswordRules } from "@/hooks/usePasswordRules";

export function SignupBasicInfo({
  data,
  onChange,
  errors,
}: {
  data: NewUser;
  onChange: (field: keyof NewUser, value: string) => void;
  errors?: typeToFlattenedError<NewUser>;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  //   const password = watch("password") || "";
  const rules = usePasswordRules(data.password || "");
  const getStrengthScore = () => Object.values(rules).filter(Boolean).length;

  const checkEmail = zEmail.safeParse(data.email);

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label htmlFor="firstname" className="gap-0.5">
            First name<span className="text-destructive">*</span>
          </Label>
          <span className="text-xs text-destructive">
            {errors?.fieldErrors?.firstname?.[0] || ""}
          </span>
        </div>
        <Input
          id="firstname"
          value={data.firstname}
          onChange={(e) => onChange("firstname", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lastname">Last name</Label>
        <Input
          id="lastname"
          value={data.lastname ?? ""}
          onChange={(e) => onChange("lastname", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label htmlFor="email" className="gap-0.5">
            Email<span className="text-destructive">*</span>
          </Label>
          <span className="text-xs text-destructive">
            {errors?.fieldErrors?.email?.[0] || ""}
          </span>
        </div>
        <Input
          id="email"
          type="email"
          required
          placeholder="m@example.com"
          value={data.email}
          onChange={(e) => onChange("email", e.target.value)}
        />
      </div>
      <div className="space-y-2 relative">
        <div className="flex justify-between ">
          <Label htmlFor="password" className="gap-0.5">
            Password<span className="text-destructive">*</span>
          </Label>
          <span className="text-xs text-destructive">
            {errors?.fieldErrors?.password?.[0] || ""}
          </span>
        </div>
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
          required
          value={data.password}
          onChange={(e) => onChange("password", e.target.value)}
          onFocus={() => setIsPasswordFocused(true)}
          onBlur={() => setIsPasswordFocused(false)}
        />
        {(isPasswordFocused ||
          (data.password && data.password?.length > 0)) && (
          <PasswordStrengthMeter
            score={getStrengthScore()}
            className={{ root: "absolute opacity-60" }}
          />
        )}

        <Button
          type="button"
          onClick={togglePasswordVisibility}
          className="absolute right-2 top-1/3 bg-transparent text-foreground hover:bg-transparent"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </div>
  );
}
