import { DialogDescription } from '@radix-ui/react-dialog';
import { MousePointerClick } from 'lucide-react';
import { useState } from 'react';

import { SmartPhoneInput } from '@/components/SmartPhoneInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Contact } from '@/domains-pending-migration/onboarding/types';

export const OnboardingCallback = () => {
  const [contact, setContact] = useState<Contact>({
    phoneNumber: '',
    countryCode: '',
    completeNumber: '',
  });
  const [submitted, _setSubmitted] = useState(false);

  const handlePhoneChange = (value: {
    phoneNumber: string;
    countryCode: string;
    completeNumber: string;
  }) => {
    setContact({
      phoneNumber: value.phoneNumber,
      countryCode: value.countryCode,
      completeNumber: value.completeNumber,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!contact?.completeNumber) {
      return;
    }

    // TODO: Send to Slack / Google Chat
    // TODO: Send to email
  };

  return (
    <Dialog>
      <DialogTrigger>
        <div className="bg-muted text-muted-foreground flex gap-1 rounded-md px-2 py-1 text-xs">
          {/* <div className="flex gap-1 text-xs absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-1/2 "> */}
          <span className="text-nowrap">Need help? </span>
          <span className="hover:text-foreground flex cursor-pointer font-medium text-nowrap hover:underline">
            Request a callback <MousePointerClick size={16} />
          </span>
          {/* <span className="text-nowrap hidden md:block">
            - we'll call to guide you through!
          </span> */}
        </div>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-sm"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="">Phone Number</DialogHeader>
        <DialogDescription className="hidden"></DialogDescription>

        {submitted ? (
          <div>Submitted</div>
        ) : (
          <form className="flex max-w-md flex-col gap-4 shadow-sm">
            <SmartPhoneInput
              value={{ phoneNumber: '', countryCode: '', completeNumber: '' }}
              onChange={handlePhoneChange}
              showLabel={false}
            />
            <Button onClick={handleSubmit}>Submit</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
