import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MousePointerClick } from "lucide-react";

export const OnboardingCallback = () => {
  return (
    <Dialog>
      <DialogTrigger>
        <div className="flex gap-1 text-xs rounded-md px-2 py-1 bg-muted text-muted-foreground">
          {/* <div className="flex gap-1 text-xs absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-1/2 "> */}
          <span className="text-nowrap">Need help? </span>
          <span className="font-medium hover:underline hover:text-foreground cursor-pointer text-nowrap flex">
            Request a callback <MousePointerClick size={16} />
          </span>
          {/* <span className="text-nowrap hidden md:block">
            - we'll call to guide you through!
          </span> */}
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader></DialogHeader>
        <div>Submit your phone number</div>
        <SmartPhoneInput />
      </DialogContent>
    </Dialog>
  );
};
