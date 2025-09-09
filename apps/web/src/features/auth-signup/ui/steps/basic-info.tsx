import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { usePasswordRules } from '@/shared/hooks/usePasswordRules';
import { newUser, type NewUser } from '@/modules/auth';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { FormField } from '@/components/FormField';
import type { AxiosError } from 'axios';

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
    setError,
    clearErrors,
  } = useForm<NewUser>({
    resolver: standardSchemaResolver(newUser),
    defaultValues: userData,
    mode: 'onChange',
  });
  const password = watch('password');
  const { score } = usePasswordRules(password);

  // Sync form changes to Signup.tsx
  useEffect(() => {
    Object.entries(userData).forEach(([key, value]) => {
      setValue(key as keyof NewUser, value);
    });
  }, [userData, setValue]);

  const validateEmail = async (email: string) => {
    // await trigger("email"); // First validate format via Zod
    // if (errors.email) return false;

    if (checkEmail) {
      try {
        const isValid = await checkEmail(email);
        if (isValid) clearErrors('email');
        if (!isValid) return { isValid, error: 'This email has already been registered' };
        return { isValid, error: null };
      } catch (error: unknown) {
        return {
          isValid: true,
          error:
            (error as AxiosError<{ message: string }>)?.response?.data?.message ||
            (error as Error).message ||
            "We're having trouble checking this email",
        };
      }
    }
    return { isValid: true, error: null };
  };

  // Sync & Validation
  useImperativeHandle(ref, () => ({
    validate: async () => {
      const isValid = await trigger();
      const { isValid: isEmailValid, error: emailError } = await validateEmail(userData.email);
      if (emailError) {
        setError('email', { message: emailError });
      }
      return isValid && isEmailValid;
    },
  }));

  console.log();
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Firstname */}
      <FormField id="firstname" label="First name" error={errors.firstname?.message} required>
        <Input
          id="firstname"
          {...register('firstname', {
            onChange: (e) => updateUserField('firstname', e.target.value),
          })}
          aria-describedby={errors.firstname ? 'firstname-error' : undefined}
          placeholder="Jane"
        />
      </FormField>

      <div className="grid md:grid-cols-2 gap-2">
        {/* Lastname */}
        <FormField id="lastname" label="Last name" error={errors.lastname?.message}>
          <Input
            id="lastname"
            {...register('lastname', {
              onChange: (e) => updateUserField('lastname', e.target.value),
            })}
            aria-describedby={errors.lastname ? 'lastname-error' : undefined}
            placeholder="Doe"
          />
        </FormField>

        {/* Phone Number */}
        <FormField
          id="phoneNumber"
          label="Phone number"
          error={errors.phoneNumber?.message}
          helpTooltip="Leave your number if you’d like more personalized help from our team"
          tooltipStyle="text-center"
        >
          <Input
            id="phoneNumber"
            {...register('phoneNumber', {
              onChange: (e) => updateUserField('phoneNumber', e.target.value),
            })}
            aria-describedby={errors.phoneNumber ? 'phoneNumber-error' : undefined}
            placeholder="+65 9123 4567"
          />
        </FormField>
      </div>

      {/* Email */}
      <FormField id="email" label="Email" required error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          {...register('email', {
            onChange: (e) => updateUserField('email', e.target.value),
            onBlur: async (e) => {
              const { isValid, error } = await validateEmail(e.target.value);
              if (error) {
                setError('email', { message: error });
              } else if (isValid) {
                clearErrors('email');
              }
            },
          })}
          placeholder="m@example.com"
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
      </FormField>

      {/* Password */}
      <FormField id="password" label="Password" required error={errors.password?.message}>
        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          {...register('password', {
            onChange: (e) => updateUserField('password', e.target.value),
          })}
          aria-describedby={errors.password ? 'password-error' : undefined}
          placeholder="••••••••••••"
        />
        {password && (
          <PasswordStrengthMeter score={score} className={{ root: 'absolute opacity-60' }} />
        )}
        <Button
          type="button"
          onClick={togglePasswordVisibility}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/3 bg-transparent text-foreground hover:bg-transparent"
        >
          {showPassword ? <EyeOff /> : <Eye />}
        </Button>
        {/* </div> */}
      </FormField>
    </div>
  );
});
