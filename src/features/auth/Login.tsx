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
import { routes } from "@/utils/routes";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { loginForm, LoginForm } from "./types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { handleLogin } from "./service";
import { toast } from "sonner";
import { ErrorCode } from "@/utils/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";

export default function Login() {
  const { setUser, isLoggedIn, checkingSession, user } = useAuth();
  const { setCompany, companyId, company } = useCompany();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [_isLoading, setIsLoading] = useState(false);

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
      const res = await handleLogin(data);

      if (!res.success) {
        const message = res.message || "Email or password is incorrect";
        if (res.code === ErrorCode.INVALID_CREDENTIALS) {
          setError("email", { type: "manual", message });
          setError("password", { type: "manual", message });
        }
        toast.error(message);
        return;
      }

      const { user, company } = res.data;
      if (!user || !company) {
        toast.error("Login failed");
        return;
      }

      setUser(user);
      setCompany(company);
    } catch (error) {
      console.error(error);
      toast("An unexpected error occurred, please try again");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const companyIdentifier =
      company?.id ||
      companyId ||
      (user && user.currentCompanyId) ||
      (user && user.company?.id);
    if (!checkingSession && isLoggedIn && companyIdentifier) {
      navigate(routes.dashboard.root(companyIdentifier), { replace: true });
    }
  }, [isLoggedIn, companyId, checkingSession, user, company, navigate]);

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Welcome Back 👋</CardTitle>
              <CardDescription>
                Enter your email below to login to your account
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
                      to={routes.auth.forgotPassword}
                      className="absolute -bottom-3.5 right-0 text-right text-sm underline-offset-4 hover:underline"
                    >
                      Forgot your password?
                    </Link>
                  </div>
                </div>
                <div className="flex flex-col gap-3 mt-2">
                  <Button type="submit" className="w-full">
                    Login
                  </Button>
                </div>
                <div className="text-center text-sm">
                  Don't have an account?{" "}
                  <Link
                    to={routes.auth.signup}
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
  );
}
