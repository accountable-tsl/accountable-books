import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Eye, EyeOff } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { typeToFlattenedError } from "zod";
import { zEmail } from "@/types/types";
import { usePasswordRules } from "@/hooks/usePasswordRules";
import { newUser, NewUser } from "../signupTypes";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormField } from "@/components/FormField";
import { validate } from "numeral";

export interface SignupBasicInfoHandle {
  validate: () => Promise<boolean>;
}

export const SignupBasicInfo = forwardRef<
  SignupBasicInfoHandle,
  {
    userData: NewUser;
    updateUserField: (field: keyof NewUser, value: string) => void;
    checkEmail?: (email: string) => Promise<boolean>;
  }
>(({ userData, updateUserField, checkEmail }, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    watch,
    formState: { errors },
    setValue,
    trigger,
  } = useForm<NewUser>({
    resolver: zodResolver(newUser),
    defaultValues: userData,
    mode: "onChange",
  });
  const password = watch("password");
  const { score } = usePasswordRules(password);

  // Sync form changes to Signup.tsx
  useEffect(() => {
    Object.entries(userData).forEach(([key, value]) => {
      setValue(key as keyof NewUser, value);
    });
  }, [userData, setValue]);

  // Expose validate method to parent
  useImperativeHandle(ref, () => ({
    validate: async () => {
      return await trigger();
    },
  }));

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  console.log(password);
  console.log("password", userData.password);
  console.log("userData", userData);
  return (
    <div className="flex flex-col gap-4">
      {/* Firstname */}
      <FormField
        id="firstname"
        label="First name"
        error={errors.firstname?.message}
      >
        <Input
          id="firstname"
          {...register("firstname", {
            onChange: (e) => updateUserField("firstname", e.target.value),
          })}
          aria-describedby={errors.firstname ? "firstname-error" : undefined}
        />
      </FormField>

      {/* Lastname */}
      <FormField
        id="lastname"
        label="Last name"
        error={errors.lastname?.message}
      >
        <Input
          id="lastname"
          {...register("lastname", {
            onChange: (e) => updateUserField("lastname", e.target.value),
          })}
          aria-describedby={errors.lastname ? "lastname-error" : undefined}
        />
      </FormField>

      {/* Email */}
      <FormField
        id="email"
        label="Email"
        required
        error={errors.email?.message}
      >
        <Input
          id="email"
          type="email"
          {...register("email", {
            onChange: (e) => updateUserField("email", e.target.value),
            onBlur: async (e) =>
              checkEmail && (await checkEmail(e.target.value)),
          })}
          placeholder="m@example.com"
          aria-describedby={errors.email ? "email-error" : undefined}
        />
      </FormField>

      {/* Password */}
      <FormField
        id="password"
        label="Password"
        required
        error={errors.password?.message}
      >
        {/* <div className="relative"> */}
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
          {...register("password", {
            onChange: (e) => updateUserField("password", e.target.value),
          })}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        {password && (
          <PasswordStrengthMeter
            score={score}
            className={{ root: "absolute opacity-60" }}
          />
        )}
        <Button
          type="button"
          onClick={togglePasswordVisibility}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/3 bg-transparent text-foreground hover:bg-transparent"
        >
          {showPassword ? <EyeOff /> : <Eye />}
        </Button>
        {/* </div> */}
      </FormField>
    </div>
  );
});
