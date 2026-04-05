import { useEffect, useRef } from 'react';
import { Header } from '@/components/header';
import { Card, CardContent } from '@/components/ui/card';
import { Heart, Quote, Star } from 'lucide-react';

type WallOfLoveProps = {
  onNavigate?: (page: 'landing' | 'wall-of-love') => void;
};

// Testimonials data
const testimonials = [
  {
    id: 1,
    name: 'Sarah Chen',
    role: 'Founder, TechStart Inc.',
    content:
      'Accountable has completely transformed how we handle our books. What used to take hours now takes minutes. The automation is incredible.',
    rating: 5,
  },
  {
    id: 2,
    name: 'Michael Okafor',
    role: 'CPA, Okafor & Associates',
    content:
      "Finally, accounting software that doesn't make me want to pull my hair out. It's intuitive, fast, and actually works the way I think.",
    rating: 5,
  },
  {
    id: 3,
    name: 'Emily Rodriguez',
    role: 'Freelance Accountant',
    content:
      'As a freelancer managing multiple clients, Accountable has been a game-changer. The automation handles the busywork so I can focus on what matters.',
    rating: 5,
  },
  {
    id: 4,
    name: 'David Kim',
    role: 'Business Owner',
    content:
      "We've tried every accounting tool out there. Accountable is the first one that actually makes sense. Clean, simple, and it just works.",
    rating: 5,
  },
  {
    id: 5,
    name: 'Lisa Thompson',
    role: 'CFO, GrowthCo',
    content:
      'The smart automation features have saved us countless hours. Our team can finally focus on strategic work instead of manual data entry.',
    rating: 5,
  },
  {
    id: 6,
    name: 'James Wilson',
    role: 'Accounting Firm Partner',
    content:
      'Accountable thinks like an accountant. It understands our workflow and adapts to how we work, not the other way around.',
    rating: 5,
  },
];

// Client logos - you can replace these with actual logo images
// To add logo images, replace the name with an image path:
// { name: "Company Name", logo: "/logos/company-logo.png", id: 1 }
type ClientLogo = {
  name: string;
  id: number;
  logo?: string;
};

const clientLogos: ClientLogo[] = [
  { name: 'TechStart Inc.', id: 1 },
  { name: 'Okafor & Associates', id: 2 },
  { name: 'GrowthCo', id: 3 },
  { name: 'Innovate Labs', id: 4 },
  { name: 'Scale Ventures', id: 5 },
  { name: 'NextGen Solutions', id: 6 },
  { name: 'Prime Accounting', id: 7 },
  { name: 'Elite Business Group', id: 8 },
];

export default function WallOfLove({ onNavigate }: WallOfLoveProps) {
  const logosRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const logosContainer = logosRef.current;
    if (!logosContainer) return;

    // Reset scroll position to start
    logosContainer.scrollLeft = 0;

    // Create smooth infinite scroll effect
    const scroll = () => {
      const maxScroll = logosContainer.scrollWidth / 2;
      if (logosContainer.scrollLeft >= maxScroll - 1) {
        logosContainer.scrollLeft = 0;
      } else {
        logosContainer.scrollLeft += 0.5;
      }
    };

    const interval = setInterval(scroll, 16); // ~60fps
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPage="wall-of-love" onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-12">
        {/* Hero Section */}
        <div className="mb-12 text-center md:mb-16">
          <div className="mb-4 inline-flex items-center gap-2">
            <Heart className="text-primary fill-primary size-5" />
            <h1 className="text-2xl font-semibold md:text-3xl">Wall of Love</h1>
          </div>
          <p className="text-muted-foreground mx-auto max-w-2xl text-sm md:text-base">
            See what our community is saying about Accountable. Real feedback
            from real people who use our platform every day.
          </p>
        </div>

        {/* Client Logos Section */}
        <section className="mb-12 md:mb-16">
          <h2 className="text-muted-foreground mb-6 text-center text-sm font-medium">
            Trusted by leading businesses
          </h2>
          <div
            ref={logosRef}
            className="flex gap-8 overflow-x-hidden md:gap-12"
            style={{
              maskImage:
                'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
            }}
          >
            {/* Duplicate logos for seamless loop */}
            {[...clientLogos, ...clientLogos].map((client, index) => (
              <div
                key={`${client.id}-${index}`}
                className="flex h-16 flex-shrink-0 items-center justify-center px-6 md:h-20 md:px-8"
              >
                {client.logo ? (
                  <img
                    src={client.logo}
                    alt={client.name}
                    className="h-8 w-auto object-contain opacity-60 transition-opacity hover:opacity-100 md:h-10"
                  />
                ) : (
                  <div className="text-muted-foreground/60 text-sm font-medium whitespace-nowrap md:text-base">
                    {client.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials Grid */}
        <section>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.id} size="sm">
                <CardContent className="flex flex-col gap-3 pt-4">
                  {/* Quote Icon */}
                  <div className="flex items-start justify-between">
                    <Quote className="text-muted-foreground/40 size-5" />
                    <div className="flex gap-0.5">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star
                          key={i}
                          className="fill-primary text-primary size-3"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Content */}
                  <p className="text-foreground text-sm leading-relaxed">
                    {testimonial.content}
                  </p>

                  {/* Author */}
                  <div className="border-muted/50 mt-auto border-t pt-2">
                    <p className="text-xs font-medium">{testimonial.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {testimonial.role}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="mt-12 text-center md:mt-16">
          <Card className="border-muted/50 bg-muted/20">
            <CardContent className="py-6 md:py-8">
              <h3 className="mb-2 text-base font-semibold md:text-lg">
                Join our community
              </h3>
              <p className="text-muted-foreground mx-auto mb-4 max-w-md text-sm">
                Experience the difference Accountable can make for your
                business.
              </p>
              {onNavigate ? (
                <button
                  onClick={() => onNavigate('landing')}
                  className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                >
                  Get started
                  <span>→</span>
                </button>
              ) : (
                <a
                  href="/"
                  className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                >
                  Get started
                  <span>→</span>
                </a>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
