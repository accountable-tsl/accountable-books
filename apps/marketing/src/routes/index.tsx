import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/lib/utils';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ExternalLink, Loader, Mail, UserCheck } from 'lucide-react';

export const Route = createFileRoute('/')({
  component: HomeComponent,
});

const USER_CATEGORIES = [
  { label: 'Other', value: 'other' },
  { label: 'Accountant', value: 'accountant' },
  {
    label: 'Accounting Firm',
    value: 'accounting_firm',
    collectCompanyInfo: true,
  },
  { label: 'Accounting Freelancer', value: 'freelancer' },
  {
    label: 'Founder / Business Owner',
    value: 'business_owner',
    collectCompanyInfo: true,
  },
];

const COMPANY_SIZES = [
  { label: '1-10', value: '1-10' },
  { label: '10-100', value: '10-100' },
  { label: '100-500', value: '100-500' },
  { label: '500-1000', value: '500-1000' },
  { label: '1000-5000', value: '1000-5000' },
  { label: '5000+', value: '5000+' },
];

function HomeComponent() {
  const isMobile = useIsMobile();
  const [email, setEmail] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isNigeria, setIsNigeria] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [category, setCategory] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  const [showDino, setShowDino] = useState(false);

  // Derived state
  const selectedCategory = USER_CATEGORIES.find((c) => c.value === category);
  const showCompanyInfo = selectedCategory?.collectCompanyInfo === true;
  const showAdditionalInfo = category !== '';
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isFormValid =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    category !== '' &&
    additionalInfo.trim() !== '';

  const SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbwMmJmpqROFmKyaXMHI0akUvs8um8VUDB8HdIiuqiCJ7Enm4DnvTNEfvfsI6vZpFdN2YQ/exec';

  const handleJoin = () => {
    if (!isValidEmail) return;
    setIsOpen(true);
  };

  // Build form payload - shared between complete and partial submissions
  const buildFormPayload = (
    status: 'completed' | 'abandoned' | 'email_only',
  ) => {
    const payload = new URLSearchParams();
    payload.append('date', new Date().toISOString());
    payload.append('email', email.trim());
    payload.append('firstName', firstName.trim());
    payload.append('lastName', lastName.trim());
    payload.append('category', selectedCategory?.label || category);
    payload.append('companyName', companyName.trim());
    payload.append('companySize', companySize);
    payload.append('additionalInfo', additionalInfo.trim());
    payload.append('status', status);
    payload.append('isPartial', status === 'completed' ? 'false' : 'true');
    return payload;
  };

  // Send data to Google Sheets
  const sendToSheets = async (payload: URLSearchParams, useBeacon = false) => {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(SCRIPT_URL, payload);
    } else {
      // For regular fetch, convert URLSearchParams to FormData for consistency
      const formData = new FormData();
      for (const [key, value] of payload.entries()) {
        formData.append(key, value);
      }
      return fetch(SCRIPT_URL, {
        method: 'POST',
        body: formData,
        mode: 'no-cors',
        keepalive: useBeacon,
      });
    }
  };

  const handleSave = async () => {
    if (!email || isLoading || isSuccess) return;

    setIsLoading(true);
    try {
      const payload = buildFormPayload('completed');
      await sendToSheets(payload);
      setIsSuccess(true);
      setIsOpen(false);
    } catch (error) {
      console.error('Error submitting form', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setIsSuccess(false);
    setIsOpen(false);
    setEmail('');
    setFirstName('');
    setLastName('');
    setCategory('');
    setCompanyName('');
    setCompanySize('');
    setAdditionalInfo('');
    setIsLoading(false);
  };

  // Capture abandoned/partial form data
  const captureAbandonedData = useCallback(
    (status: 'abandoned' | 'email_only' = 'abandoned') => {
      if (isSuccess || !email.trim()) return;

      const payload = new URLSearchParams();
      payload.append('date', new Date().toISOString());
      payload.append('email', email.trim());
      payload.append('firstName', firstName.trim());
      payload.append('lastName', lastName.trim());
      payload.append('category', selectedCategory?.label || category);
      payload.append('companyName', companyName.trim());
      payload.append('companySize', companySize);
      payload.append('additionalInfo', additionalInfo.trim());
      payload.append('status', status);
      payload.append('isPartial', 'true');

      if (navigator.sendBeacon) {
        navigator.sendBeacon(SCRIPT_URL, payload);
      } else {
        const formData = new FormData();
        for (const [key, value] of payload.entries()) {
          formData.append(key, value);
        }
        fetch(SCRIPT_URL, {
          method: 'POST',
          body: formData,
          mode: 'no-cors',
          keepalive: true,
        }).catch(() => {
          // Silently fail - we tried our best
        });
      }
    },
    [
      isSuccess,
      email,
      firstName,
      lastName,
      category,
      selectedCategory,
      companyName,
      companySize,
      additionalInfo,
    ],
  );

  const handleCancel = () => {
    captureAbandonedData('abandoned');
    setIsOpen(false);
  };

  // Legacy tally redirect - kept for reference
  // const handleJoinTally = () => {
  //   const trimmedEmail = email.trim();
  //   const baseUrl = "https://tally.so/r/3Ea6J2";
  //   const prefillUrl = trimmedEmail
  //     ? `${baseUrl}?email=${encodeURIComponent(trimmedEmail)}`
  //     : baseUrl;
  //   window.open(prefillUrl, "_blank", "noopener,noreferrer");
  // };
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locales = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
    const hasNigeriaLocale = locales.some((locale) => /-NG$/i.test(locale));
    setIsNigeria(timeZone === 'Africa/Lagos' || hasNigeriaLocale);
  }, []);

  // Capture abandoned data when form is open
  useEffect(() => {
    if (!isOpen || isSuccess) return;

    const handleBeforeUnload = () => {
      captureAbandonedData('abandoned');
    };

    let abandonTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Only log abandonment if page stays hidden for 3 seconds
        // This prevents false positives from brief tab switches
        abandonTimeout = setTimeout(() => {
          captureAbandonedData('abandoned');
        }, 3000);
      } else {
        // User came back - cancel the abandonment logging
        if (abandonTimeout) {
          clearTimeout(abandonTimeout);
          abandonTimeout = null;
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (abandonTimeout) {
        clearTimeout(abandonTimeout);
      }
    };
  }, [isOpen, isSuccess, captureAbandonedData]);

  // Capture email-only if user enters email but never clicks button
  useEffect(() => {
    if (isOpen || isSuccess || !isValidEmail) return;

    const handleBeforeUnload = () => {
      captureAbandonedData('email_only');
    };

    let abandonTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Only log abandonment if page stays hidden for 3 seconds
        // This prevents false positives from brief tab switches
        abandonTimeout = setTimeout(() => {
          captureAbandonedData('email_only');
        }, 3000);
      } else {
        // User came back - cancel the abandonment logging
        if (abandonTimeout) {
          clearTimeout(abandonTimeout);
          abandonTimeout = null;
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (abandonTimeout) {
        clearTimeout(abandonTimeout);
      }
    };
  }, [isOpen, isSuccess, isValidEmail, captureAbandonedData]);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <div className="flex w-full flex-1">
        <div className="relative mx-auto flex max-w-5xl flex-1 flex-col px-4">
          <div className="flex w-full flex-1 items-center justify-center px-4">
            {showDino ? (
              <div className="flex w-full flex-col items-center gap-4">
                <div className="flex w-full justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDino(false)}
                    className="text-xs"
                  >
                    ← Back
                  </Button>
                </div>
                <div className="border-muted/50 bg-muted/20 relative min-h-[60vh] w-full overflow-hidden rounded-md border md:min-h-[70vh]">
                  <iframe
                    title="Accountable Dino"
                    src="/dino/index.html"
                    loading="lazy"
                    className="absolute inset-0 h-full w-full"
                    onClick={(e) => {
                      // Focus the iframe when clicked so keyboard events work
                      (e.target as HTMLIFrameElement).focus();
                    }}
                  />
                </div>
                <div className="text-center text-xs">
                  Glad you're taking a break!
                </div>
              </div>
            ) : (
              <div className="flex h-full max-w-md flex-col items-center justify-center gap-4">
                <div className="text-center">
                  <h1 className="font-semibold">
                    Accounting shouldn't feel like torture
                  </h1>
                  <p className="text-muted-foreground text-xs">
                    Stop chasing bank statements. Let AI handle the boring work
                    so your firm can deliver better books, on time.
                  </p>
                </div>

                {isSuccess ? (
                  <div>
                    <div className="border-muted/50 flex flex-col items-center gap-3 rounded-md border p-4 py-4 text-center">
                      <UserCheck className="text-muted-foreground h-6 w-6" />
                      <p className="text-muted-foreground text-sm">
                        Thanks for your interest! We'll be in touch soon.
                      </p>

                      <Button
                        variant="link"
                        size="xs"
                        className="text-muted-foreground/60"
                        onClick={handleReset}
                      >
                        Submit another
                      </Button>
                    </div>
                    <div className="pt-1 text-center">
                      <Button
                        variant="link"
                        size="xs"
                        onClick={() => setShowDino(true)}
                        className="text-muted-foreground/60"
                      >
                        Want a break? Play Dino 🦖
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    <form
                      className="flex w-full flex-col gap-2 transition-all"
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleJoin();
                      }}
                    >
                      {isMobile ? (
                        <div className="flex w-full flex-col gap-2">
                          <Input
                            type="email"
                            autoComplete="email"
                            name="email"
                            placeholder="mail@example.com"
                            className="w-full"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            disabled={isLoading || isOpen}
                          />
                          {!isOpen && (
                            <Button type="submit" disabled={!isValidEmail}>
                              Join the waitlist
                            </Button>
                          )}
                        </div>
                      ) : (
                        <InputGroup className="px-0.5">
                          <InputGroupInput
                            type="email"
                            autoComplete="email"
                            name="email"
                            placeholder="mail@example.com"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            disabled={isLoading || isOpen}
                          />
                          <InputGroupButton
                            type="submit"
                            disabled={isLoading || isOpen || !isValidEmail}
                          >
                            {/* Get notified */}
                            Join the waitlist
                          </InputGroupButton>
                        </InputGroup>
                      )}
                    </form>

                    <Collapsible
                      open={isOpen}
                      onOpenChange={setIsOpen}
                      className="w-full"
                    >
                      <CollapsibleContent className="flex flex-col gap-4 overflow-hidden py-4">
                        {/* User Information */}
                        <div className="flex flex-col gap-1">
                          <p className="text-primary text-sm">
                            Your Information
                          </p>
                          <div className="relative flex flex-col gap-0.5 rounded-md after:absolute after:top-1 after:right-3 after:ml-0.5 after:text-cyan-500/50 after:content-['*'] md:flex-row md:items-end md:gap-2">
                            <Label
                              htmlFor="first-name"
                              className="text-muted-foreground sr-only shrink-0 text-xs"
                            >
                              <span className="after:ml-0.5 after:text-cyan-500/50 after:content-['*']">
                                First name
                              </span>
                            </Label>
                            <Input
                              id="first-name"
                              placeholder="First name"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              required
                            />
                          </div>
                          <div className="relative flex flex-col gap-0.5 rounded-md after:absolute after:top-1 after:right-3 after:ml-0.5 after:text-cyan-500/50 after:content-['*'] md:flex-row md:items-end md:gap-2">
                            <Label
                              htmlFor="last-name"
                              className="text-muted-foreground sr-only shrink-0 text-xs"
                            >
                              <span className="after:ml-0.5 after:text-cyan-500/50 after:content-['*']">
                                Last name
                              </span>
                            </Label>
                            <Input
                              id="last-name"
                              placeholder="Last name"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-0.5 rounded-md md:flex-row md:items-end md:gap-2">
                            <Label
                              htmlFor="category"
                              className="text-muted-foreground sr-only shrink-0 text-xs"
                            >
                              <span className="after:ml-0.5 after:text-cyan-500/50 after:content-['*']">
                                Identity
                              </span>
                            </Label>
                            <div className="flex-1">
                              <Select
                                value={category}
                                onValueChange={(value) =>
                                  setCategory(value ?? '')
                                }
                              >
                                <SelectTrigger id="category" className="w-full">
                                  <SelectValue placeholder="What best describes you?">
                                    {selectedCategory?.label}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {USER_CATEGORIES.map((item) => (
                                      <SelectItem
                                        key={item.value}
                                        value={item.value}
                                      >
                                        {item.label}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>

                        {/* Conditionally show company fields */}
                        {showCompanyInfo && (
                          <div className="flex flex-col gap-1">
                            <p className="text-primary text-sm">
                              Company Information
                            </p>

                            <div className="flex flex-col gap-0.5 rounded-md md:flex-row md:items-end md:gap-2">
                              <Label
                                htmlFor="company-name"
                                className="text-muted-foreground sr-only shrink-0 text-xs"
                              >
                                <span className="">Company Name</span>
                              </Label>
                              <Input
                                id="company-name"
                                placeholder="Company Name"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                              />
                            </div>

                            <div className="flex flex-col gap-0.5 rounded-md md:flex-row md:items-end md:gap-2">
                              <Label
                                htmlFor="company-size"
                                className="text-muted-foreground sr-only shrink-0 text-xs"
                              >
                                <span className="after:ml-0.5 after:text-cyan-500/50 after:content-['*']">
                                  Company Size
                                </span>
                              </Label>
                              <div className="flex-1">
                                <Select
                                  value={companySize}
                                  onValueChange={(value) =>
                                    setCompanySize(value ?? '')
                                  }
                                >
                                  <SelectTrigger
                                    id="company-size"
                                    className="w-full"
                                  >
                                    <SelectValue placeholder="Company Size">
                                      {
                                        COMPANY_SIZES.find(
                                          (s) => s.value === companySize,
                                        )?.label
                                      }
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {COMPANY_SIZES.map((item) => (
                                        <SelectItem
                                          key={item.value}
                                          value={item.value}
                                        >
                                          {item.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Why & Additional Information */}
                        {showAdditionalInfo && (
                          <div className="relative after:absolute after:top-1 after:right-3 after:ml-0.5 after:text-cyan-500/50 after:content-['*']">
                            <Label
                              htmlFor="additional-info"
                              className="text-muted-foreground sr-only shrink-0 text-xs"
                            >
                              <span className="after:ml-0.5 after:text-cyan-500/50 after:content-['*']">
                                Why & Additional Information
                              </span>
                            </Label>
                            <Textarea
                              id="additional-info"
                              placeholder="Why join the waitlist?"
                              className="after:text-cyan-500 after:content-['*']"
                              value={additionalInfo}
                              onChange={(e) =>
                                setAdditionalInfo(e.target.value)
                              }
                            />
                          </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancel}
                            disabled={isLoading}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={isLoading || !isFormValid}
                          >
                            {isLoading ? (
                              <Loader className="mr-2 size-3 animate-spin" />
                            ) : null}
                            Save Details
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}

                <img
                  src="/undraw_all-the-data_ijgn.svg"
                  alt=""
                  className="absolute top-0 left-0 opacity-0.5 md:top-auto md:right-0 md:bottom-0 md:left-auto md:w-80"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex w-full shrink-0">
        <div className="mx-auto flex max-w-5xl flex-1 gap-2 px-4 py-2 text-xs">
          {isMobile ? (
            <div className="text-muted-foreground/50 flex w-full justify-center gap-0.5">
              {isNigeria ? (
                <>
                  <ExternalLink className="size-3.5" />
                  <div className="cursor-pointer hover:text-cyan-300/50 hover:underline">
                    <a
                      href="https://payroll.getaccountable.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Free Payroll tool for Nigerian businesses
                    </a>
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground/40 flex items-center gap-2">
                  <div className="cursor-pointer hover:text-cyan-300/50 hover:underline">
                    <a
                      href="mailto:cx@getaccountable.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      cx@getaccountable.com
                    </a>
                  </div>
                  <Mail className="size-3.5" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex w-full justify-between">
              {isNigeria ? (
                <div className="text-muted-foreground/50 flex gap-2">
                  <div>Free resources: </div>
                  <div className="cursor-pointer hover:text-cyan-300/50 hover:underline">
                    <a
                      href="https://payroll.getaccountable.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {' '}
                      🇳🇬 Payroll
                    </a>
                  </div>
                </div>
              ) : null}

              <div className="text-muted-foreground/40 flex items-center gap-2">
                {!isNigeria && <Mail className="size-3.5" />}
                <div className="cursor-pointer hover:text-cyan-300/50 hover:underline">
                  <a
                    href="mailto:cx@getaccountable.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    cx@getaccountable.com
                  </a>
                </div>
                {isNigeria && <Mail className="size-3.5" />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
