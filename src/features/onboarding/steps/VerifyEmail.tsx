import icon from "@/assets/images/email-file.gif";
import { Button } from "@/components/ui/button";
export const VerifyEmail = () => {
  return (
    <div className="flex flex-col items-center p-8 md:p-16 gap-4 w-full flex-1 justify-between md:justify-center max-h-[45rem]">
      <div className="flex flex-col items-center">
        <p className="font-medium text-lg">Verify your email</p>
        <p className="text-sm text-muted-foreground text-center">
          <span className="hidden md:inline">
            Your financial data needs to be kept secure and confidential.
          </span>
          <span className="block">Let's verify that it's you</span>
        </p>
      </div>

      <div className="w-40">
        <img src={icon} alt="verify email icon" />
      </div>

      <div className="text-center text-sm md:text-base">
        We've sent a verification link to{" "}
        <span className="text-blue-500">[email address]</span>. Click it to
        verify your account and continue setup. Can't find it? Check your spam
        folder or click 'Resend' below.
      </div>

      <div className="flex gap-4 mb-16 md:mb-0 md:mt-16">
        <Button variant={"outline"}>Resend Email</Button>
        <Button>Verify Email</Button>
      </div>
    </div>
  );
};
