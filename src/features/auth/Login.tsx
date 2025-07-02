import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { loginForm, LoginForm } from "./types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useAuth, useSessionLoader } from "./hooks";
import { routes } from "@/shared/routes/routes";
import { AuthHeader } from "@/components/AuthHeader";
import { toast } from "sonner";
import { loginAndRedirect } from "@/features/auth/utils";
import { CenteredLoader } from "@/components/CenteredLoader";

export default function Login() {
  const {
    setAuth,
    logout,
    isLoggedIn,
    hasAppAccess,
    currentCompanyId: companyId,
  } = useAuth();
  const { loading: sessionLoading } = useSessionLoader();
  const [params] = useSearchParams();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const prefillEmail = params.get("email") ?? "";

  const {
    register,
    formState: { errors },
    handleSubmit,
    setError,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginForm),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setIsLoading(true);
      await loginAndRedirect({
        email: data.email,
        password: data.password,
        setError,
        setAuth,
        logout,
      });
    } catch (error) {
      console.error(error);
      await logout();
      toast.error("An unexpected error occurred, please try again");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || sessionLoading) {
    return <CenteredLoader fullscreen />;
  }

  const alreadyLoggedIn = isLoggedIn && companyId;

  return (
    <div className="flex min-h-svh flex-col">
      <AuthHeader />
      <div className="flex flex-1 w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col gap-6">
            {alreadyLoggedIn && (
              <div className="text-center rounded-lg border border-green-300 bg-green-50 p-2 md:p-3  text-sm text-green-800 shadow-sm">
                <span className="block md:inline">
                  You're already logged in.
                </span>{" "}
                <Link
                  to={
                    hasAppAccess
                      ? routes.general.dashboard.build({ companyId })
                      : routes.onboarding.router.staticPath
                  }
                  className="underline font-medium"
                >
                  Go to dashboard
                </Link>
              </div>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Welcome Back 👋</CardTitle>
                <CardDescription>
                  {alreadyLoggedIn
                    ? "Login to a different account"
                    : "Enter your email below to login to your account"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleSubmit(onSubmit)}
                  className="flex flex-col gap-6"
                >
                  <div className="flex flex-col gap-6">
                    <FormField
                      id="email"
                      label="Email"
                      error={errors.email?.message}
                    >
                      <Input
                        id="email"
                        type="email"
                        defaultValue={prefillEmail}
                        {...register("email")}
                        placeholder="m@example.com"
                        required
                      />
                    </FormField>
                    <div className="flex flex-col relative">
                      <FormField
                        id="password"
                        label="Password"
                        error={errors.password?.message}
                      >
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          {...register("password")}
                          aria-describedby={
                            errors.password ? "password-error" : undefined
                          }
                          required
                          placeholder="************"
                        />
                        <Button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          className="absolute right-2 top-1/3 bg-transparent text-foreground hover:bg-transparent"
                        >
                          {showPassword ? <EyeOff /> : <Eye />}
                        </Button>
                        {/* </div> */}
                      </FormField>
                      <Link
                        to={routes.auth.forgotPassword.staticPath}
                        className="absolute -bottom-3.5 right-0 text-right text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </Link>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 mt-2">
                    <Button type="submit" className="w-full">
                      {isLoading ? "Logging in..." : "Login"}{" "}
                    </Button>
                  </div>
                  <div className="text-center text-sm">
                    Don't have an account?{" "}
                    <Link
                      to={routes.auth.signup.staticPath}
                      className="underline underline-offset-4"
                    >
                      Sign up
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
