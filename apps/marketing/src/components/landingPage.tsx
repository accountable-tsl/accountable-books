// import { useState, useEffect, useRef } from "react";
// import { useTheme } from "next-themes";
// import {
//   Moon,
//   Sun,
//   ArrowRight,
//   CheckCircle2,
//   PieChart,
//   LineChart,
//   Wallet,
//   Clock,
//   Shield,
//   Menu,
//   X,
//   Star,
// } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import {
//   motion,
//   useScroll,
//   useTransform,
//   AnimatePresence,
// } from "framer-motion";
// import { cn } from "@/lib/utils";

// export default function LandingPage() {
//   const { theme, setTheme } = useTheme();
//   const [mounted, setMounted] = useState(false);
//   const [email, setEmail] = useState("");
//   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
//   const [activeFeature, setActiveFeature] = useState(0);
//   const heroRef = useRef(null);

//   const { scrollYProgress } = useScroll({
//     target: heroRef,
//     offset: ["start start", "end start"],
//   });

//   const handleJoin = () => {
//     const prefillUrl = email
//       ? `https://tally.so/r/3Ea6J2?email=${encodeURIComponent(email)}`
//       : "https://tally.so/r/3Ea6J2";
//     window.open(prefillUrl, "_blank"); // or open modal if you're using embed
//   };

//   const opacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
//   const scale = useTransform(scrollYProgress, [0, 1], [1, 0.8]);

//   // Prevent hydration mismatch
//   useEffect(() => {
//     setMounted(true);
//   }, []);

//   // Rotate through features
//   useEffect(() => {
//     const interval = setInterval(() => {
//       setActiveFeature((prev) => (prev + 1) % 3);
//     }, 5000);
//     return () => clearInterval(interval);
//   }, []);

//   if (!mounted) {
//     return null;
//   }

//   const features = [
//     {
//       icon: <PieChart className="h-6 w-6" />,
//       color: "blue-500",
//       title: "Real-time Financial Pulse",
//       description:
//         "Get instant visibility into your financial health as transactions happen. It could work for your personal finances also.",
//     },
//     {
//       icon: <Clock className="h-6 w-6" />,
//       color: "emerald-500",
//       title: "75% Less Manual Work",
//       description:
//         "Our categorization engine handles bookkeeping the 'accrual' way turning days of work into minutes.",
//     },
//     {
//       icon: <Shield className="h-6 w-6" />,
//       color: "amber-500",
//       title: "Audit-Ready Always",
//       description:
//         "Sleep better knowing your books are always audit-ready with built-in compliance checks and tax-optimized record keeping.",
//     },
//   ];

//   return (
//     <div className="min-h-screen bg-gradient-to-b from-background to-background/80 text-foreground overflow-hidden">
//       {/* Floating elements in background */}
//       <div className="fixed inset-0 overflow-hidden pointer-events-none">
//         <div className="absolute -top-20 -right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
//         <div className="absolute top-1/3 -left-20 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl" />
//         <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />

//         {/* Animated grid lines */}
//         <div className="absolute inset-0 opacity-[0.02]">
//           <div className="h-full w-full bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>
//         </div>
//       </div>

//       <header className="relative z-20 container mx-auto px-4 py-6 flex justify-between items-center">
//         <div className="flex items-center space-x-2">
//           <div className="bg-gradient-to-br from-white to-white/80 text-primary-foreground p-1.5 rounded-lg">
//             <img src="/icon.svg" alt="" className="h-5 w-5" />
//           </div>
//           <span className="font-semibold text-xl">accountable</span>
//         </div>
//         <div className="hidden md:flex items-center gap-6">
//           <Button variant="ghost" size="sm" className="text-sm font-medium">
//             Blog
//           </Button>
//           <Button variant="ghost" size="sm" className="text-sm font-medium">
//             <a href="mailto:support@getaccountable.com"></a>Contact
//           </Button>
//           <Button
//             variant="ghost"
//             size="icon"
//             onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
//           >
//             {theme === "dark" ? (
//               <Sun className="h-5 w-5" />
//             ) : (
//               <Moon className="h-5 w-5" />
//             )}
//           </Button>
//           <Button
//             size="sm"
//             className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
//             onClick={handleJoin}
//           >
//             Early Access
//           </Button>
//         </div>
//         <div className="flex items-center md:hidden">
//           <Button
//             variant="ghost"
//             size="icon"
//             onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
//             className="mr-2"
//           >
//             {theme === "dark" ? (
//               <Sun className="h-5 w-5" />
//             ) : (
//               <Moon className="h-5 w-5" />
//             )}
//           </Button>
//           <Button
//             variant="ghost"
//             size="icon"
//             onClick={() => setMobileMenuOpen(true)}
//           >
//             <Menu className="h-5 w-5" />
//           </Button>
//         </div>
//       </header>

//       {/* Mobile menu */}
//       <AnimatePresence>
//         {mobileMenuOpen && (
//           <motion.div
//             className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 md:hidden"
//             initial={{ opacity: 0, x: "100%" }}
//             animate={{ opacity: 1, x: 0 }}
//             exit={{ opacity: 0, x: "100%" }}
//             transition={{ duration: 0.3, ease: "easeInOut" }}
//           >
//             <div className="flex justify-end p-4">
//               <Button
//                 variant="ghost"
//                 size="icon"
//                 onClick={() => setMobileMenuOpen(false)}
//               >
//                 <X className="h-5 w-5" />
//               </Button>
//             </div>
//             <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-8">
//               <Button
//                 variant="ghost"
//                 size="lg"
//                 className="text-lg w-full max-w-xs justify-start"
//                 onClick={() => setMobileMenuOpen(false)}
//               >
//                 Blog
//               </Button>

//               <Button
//                 variant="ghost"
//                 size="lg"
//                 className="text-lg w-full max-w-xs justify-start"
//                 onClick={() => {
//                   setMobileMenuOpen(false);
//                   handleJoin();
//                 }}
//               >
//                 Contact
//               </Button>
//               <Button
//                 size="lg"
//                 className="text-lg w-full max-w-xs mt-4 bg-gradient-to-r from-primary to-primary/90"
//                 onClick={() => {
//                   handleJoin();
//                   setMobileMenuOpen(false);
//                 }}
//               >
//                 Early Access
//               </Button>
//             </div>
//           </motion.div>
//         )}
//       </AnimatePresence>

//       <main className="relative z-10">
//         {/* Hero Section */}
//         <section
//           ref={heroRef}
//           className="relative container mx-auto px-4 pt-16 md:pt-24 lg:pt-32 pb-16"
//         >
//           <motion.div
//             style={{ opacity, scale }}
//             className="absolute inset-0 pointer-events-none"
//           >
//             <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-b from-primary/5 to-transparent blur-3xl opacity-50" />
//           </motion.div>

//           <div className="max-w-4xl mx-auto text-center">
//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.5 }}
//             >
//               <div className="inline-flex items-center px-3 py-1 mb-6 text-sm font-medium rounded-full bg-gradient-to-r from-primary/10 to-primary/20 text-primary">
//                 <span className="relative flex h-2 w-2 mr-2">
//                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
//                   <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
//                 </span>
//                 Coming Soon - Join the Waitlist
//               </div>

//               <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
//                 Simpler bookkeeping starts here.
//               </h1>

//               <p className="text-xl md:text-2xl text-muted-foreground mb-10 leading-relaxed max-w-2xl mx-auto">
//                 {/* We're building something thoughtful for firms and businesses
//                 that want peace of mind. */}
//                 We'll make your bookkeeping 4x more efficient in one month - for
//                 firms, founders, and everyone in between.
//               </p>
//             </motion.div>

//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.5, delay: 0.2 }}
//               className="max-w-md mx-auto"
//             >
//               <div className="flex gap-2 mb-8 max-w-md">
//                 <Input
//                   type="email"
//                   placeholder="Enter your email"
//                   className="h-12 border-primary/20 focus-visible:ring-primary"
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                 />
//                 <Button
//                   size="lg"
//                   className="h-12 px-6 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
//                   onClick={handleJoin}
//                 >
//                   <span>Join Waitlist</span>
//                   <ArrowRight className="ml-2 h-4 w-4" />
//                 </Button>
//               </div>
//             </motion.div>
//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.5, delay: 0.2 }}
//             >
//               <div className="flex items-center flex-wrap justify-center gap-2 text-sm text-muted-foreground w-full mx-auto">
//                 <div className="flex md:contents items-center gap-2">
//                   <CheckCircle2 className="h-4 w-4 text-primary" />
//                   <span>Connect your accounts</span>
//                 </div>
//                 <span className="mx-2 hidden md:block">•</span>
//                 <div className="flex md:contents items-center gap-2">
//                   <CheckCircle2 className="h-4 w-4 text-primary" />
//                   <span>65% Automated bookkeeping</span>
//                 </div>
//                 <span className="mx-2 hidden md:block">•</span>
//                 <div className="flex md:contents items-center gap-2">
//                   <CheckCircle2 className="h-4 w-4 text-primary" />
//                   <span>Real time insights</span>
//                 </div>
//               </div>
//             </motion.div>
//           </div>
//         </section>

//         {/* Features Preview */}
//         <section className="container mx-auto px-4 py-16 md:py-24">
//           <motion.div
//             initial={{ opacity: 0, y: 40 }}
//             whileInView={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.7 }}
//             viewport={{ once: true }}
//             className="relative"
//           >
//             <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-transparent h-24 z-10"></div>

//             <div className="bg-gradient-to-b from-background/50 to-background/80 backdrop-blur-sm border rounded-3xl p-8 md:p-12 shadow-xl">
//               <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
//                 {features.map((feature, index) => (
//                   <motion.div
//                     key={index}
//                     className={cn(
//                       "flex flex-col transition-all duration-300 items-start",
//                       activeFeature === index
//                         ? "scale-105"
//                         : "scale-100 opacity-70"
//                     )}
//                     whileHover={{ scale: 1.05, opacity: 1 }}
//                     onClick={() => setActiveFeature(index)}
//                   >
//                     <div
//                       className={`h-14 w-14 rounded-2xl bg-${feature.color}/10 text-${feature.color} flex items-center justify-center mb-5`}
//                     >
//                       {feature.icon}
//                     </div>
//                     <h3 className="text-xl font-semibold mb-3 text-left">
//                       {feature.title}
//                     </h3>
//                     <p className="text-muted-foreground text-left">
//                       {feature.description}
//                     </p>
//                   </motion.div>
//                 ))}
//               </div>

//               <div className="mt-12 pt-8 border-t">
//                 <div className="flex flex-col md:flex-row items-center justify-between gap-6">
//                   <div className="flex flex-col md:flex-row items-center gap-4">
//                     <div className="flex -space-x-3">
//                       <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center text-blue-500 font-medium border border-blue-500/20 shadow-sm">
//                         JD
//                       </div>
//                       <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 flex items-center justify-center text-emerald-500 font-medium border border-emerald-500/20 shadow-sm">
//                         KL
//                       </div>
//                       <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 flex items-center justify-center text-amber-500 font-medium border border-amber-500/20 shadow-sm">
//                         MN
//                       </div>
//                       <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/30 flex items-center justify-center text-primary font-medium border border-primary/20 shadow-sm">
//                         +
//                       </div>
//                     </div>
//                     <p className="text-muted-foreground text-sm">
//                       Join{" "}
//                       <span className="font-medium text-foreground">
//                         218+ professionals
//                       </span>{" "}
//                       already on the waitlist
//                     </p>
//                   </div>

//                   <Button
//                     size="lg"
//                     className="w-full md:w-auto bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
//                     onClick={handleJoin}
//                   >
//                     <span>Get Early Access</span>
//                     <ArrowRight className="ml-2 h-4 w-4" />
//                   </Button>
//                 </div>
//               </div>
//             </div>
//           </motion.div>
//         </section>

//         {/* Dashboard Preview */}
//         <section className="container mx-auto px-4 py-16">
//           <motion.div
//             initial={{ opacity: 0, y: 40 }}
//             whileInView={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.7 }}
//             viewport={{ once: true }}
//           >
//             <div className="text-center mb-12">
//               <div className="inline-flex items-center px-3 py-1 mb-4 text-sm font-medium rounded-full bg-blue-500/10 text-blue-500">
//                 <span>Dashboard</span>
//               </div>
//               <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/80">
//                 "Not yet Beautiful" intuitive dashboards
//               </h2>
//               <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
//                 See where your money's going, the right way -{" "}
//                 <span className="italic text-muted-foreground/50">
//                   you didn’t lose money last month, you just paid a year’s rent.
//                 </span>
//               </p>
//             </div>

//             <div className="relative">
//               <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent h-24 bottom-0 z-10"></div>

//               <motion.div
//                 className="bg-card/30 backdrop-blur-sm border rounded-3xl p-4 md:p-6 shadow-xl overflow-hidden"
//                 whileInView={{ y: [20, 0], opacity: [0, 1] }}
//                 transition={{ duration: 0.5 }}
//                 viewport={{ once: true }}
//               >
//                 <div className="flex items-center justify-between px-2 py-3 mb-4 border-b">
//                   <div className="flex items-center gap-2">
//                     <div className="h-3 w-3 rounded-full bg-red-500"></div>
//                     <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
//                     <div className="h-3 w-3 rounded-full bg-green-500"></div>
//                   </div>
//                   <div className="text-xs text-muted-foreground">
//                     getaccountable.com/xRxfh/dashboard
//                   </div>
//                   <div className="w-16"></div>
//                 </div>

//                 <div className="flex flex-col md:flex-row gap-4 mb-4">
//                   <motion.div
//                     className="flex-1 bg-background/80 rounded-xl p-4 border"
//                     whileInView={{ y: [10, 0], opacity: [0, 1] }}
//                     transition={{ duration: 0.5, delay: 0.1 }}
//                     viewport={{ once: true }}
//                   >
//                     <div className="flex items-center justify-between mb-4">
//                       <h4 className="font-medium">Revenue Overview</h4>
//                       <div className="text-xs text-muted-foreground">
//                         Last 30 days
//                       </div>
//                     </div>
//                     <div className="h-40 flex items-end gap-1">
//                       {[35, 45, 30, 65, 40, 80, 60, 75, 65, 70, 90, 80].map(
//                         (height, i) => (
//                           <motion.div
//                             key={i}
//                             className="flex-1 bg-gradient-to-t from-primary/20 to-primary/10 rounded-t-sm"
//                             style={{ height: `${height}%` }}
//                             whileInView={{ scaleY: [0, 1] }}
//                             transition={{ duration: 0.4, delay: i * 0.05 }}
//                             viewport={{ once: true }}
//                           ></motion.div>
//                         )
//                       )}
//                     </div>
//                   </motion.div>

//                   <motion.div
//                     className="flex-1 bg-background/80 rounded-xl p-4 border"
//                     whileInView={{ y: [10, 0], opacity: [0, 1] }}
//                     transition={{ duration: 0.5, delay: 0.2 }}
//                     viewport={{ once: true }}
//                   >
//                     <div className="flex items-center justify-between mb-4">
//                       <h4 className="font-medium">Expense Breakdown</h4>
//                       <div className="text-xs text-muted-foreground">
//                         Current month
//                       </div>
//                     </div>
//                     <div className="flex items-center justify-center h-40">
//                       <motion.div
//                         className="w-32 h-32 rounded-full border-8 border-primary/10 relative"
//                         whileInView={{ rotate: 360 }}
//                         transition={{ duration: 1.5, ease: "easeInOut" }}
//                         viewport={{ once: true }}
//                       >
//                         <motion.div
//                           className="absolute inset-0 border-t-8 border-r-8 border-primary rounded-full"
//                           initial={{ rotate: 0 }}
//                           whileInView={{ rotate: 45 }}
//                           transition={{ duration: 1, delay: 0.5 }}
//                           viewport={{ once: true }}
//                         ></motion.div>
//                         <motion.div
//                           className="absolute inset-0 border-t-8 border-primary/70 rounded-full"
//                           initial={{ rotate: 0 }}
//                           whileInView={{ rotate: -75 }}
//                           transition={{ duration: 1, delay: 0.7 }}
//                           viewport={{ once: true }}
//                         ></motion.div>
//                       </motion.div>
//                     </div>
//                   </motion.div>
//                 </div>

//                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//                   <motion.div
//                     className="bg-background/80 rounded-xl p-4 border"
//                     whileInView={{ y: [10, 0], opacity: [0, 1] }}
//                     transition={{ duration: 0.5, delay: 0.3 }}
//                     viewport={{ once: true }}
//                   >
//                     <div className="flex items-center justify-between">
//                       <h4 className="text-sm font-medium text-muted-foreground">
//                         Cash Flow
//                       </h4>
//                       <LineChart className="h-4 w-4 text-emerald-500" />
//                     </div>
//                     <p className="text-2xl font-bold mt-2">$24,512</p>
//                     <div className="text-xs text-emerald-500 flex items-center mt-1">
//                       <ArrowRight className="h-3 w-3 rotate-45" />
//                       <span>+12.5% from last month</span>
//                     </div>
//                   </motion.div>

//                   <motion.div
//                     className="bg-background/80 rounded-xl p-4 border"
//                     whileInView={{ y: [10, 0], opacity: [0, 1] }}
//                     transition={{ duration: 0.5, delay: 0.4 }}
//                     viewport={{ once: true }}
//                   >
//                     <div className="flex items-center justify-between">
//                       <h4 className="text-sm font-medium text-muted-foreground">
//                         Outstanding
//                       </h4>
//                       <Wallet className="h-4 w-4 text-amber-500" />
//                     </div>
//                     <p className="text-2xl font-bold mt-2">$8,705</p>
//                     <div className="text-xs text-amber-500 flex items-center mt-1">
//                       <ArrowRight className="h-3 w-3 rotate-[135deg]" />
//                       <span>3 invoices pending</span>
//                     </div>
//                   </motion.div>

//                   <motion.div
//                     className="bg-background/80 rounded-xl p-4 border"
//                     whileInView={{ y: [10, 0], opacity: [0, 1] }}
//                     transition={{ duration: 0.5, delay: 0.5 }}
//                     viewport={{ once: true }}
//                   >
//                     <div className="flex items-center justify-between">
//                       <h4 className="text-sm font-medium text-muted-foreground">
//                         Tax Estimate
//                       </h4>
//                       <Shield className="h-4 w-4 text-blue-500" />
//                     </div>
//                     <p className="text-2xl font-bold mt-2">$4,120</p>
//                     <div className="text-xs text-blue-500 flex items-center mt-1">
//                       <CheckCircle2 className="h-3 w-3 mr-1" />
//                       <span>Up to date</span>
//                     </div>
//                   </motion.div>
//                 </div>
//               </motion.div>
//             </div>
//           </motion.div>
//         </section>

//         {/* Testimonials */}
//         <section className="container mx-auto px-4 py-16 md:py-24">
//           <motion.div
//             initial={{ opacity: 0, y: 40 }}
//             whileInView={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.7 }}
//             viewport={{ once: true }}
//           >
//             <div className="text-center mb-12">
//               <div className="inline-flex items-center px-3 py-1 mb-4 text-sm font-medium rounded-full bg-emerald-500/10 text-emerald-500">
//                 <span>Some Feedback</span>
//               </div>
//               <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/80">
//                 What early testers are saying
//               </h2>
//               <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
//                 We've been working with select firms to perfect our platform.
//               </p>
//             </div>

//             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//               {[
//                 {
//                   initials: "AW",
//                   name: "Angela Walmsley",
//                   role: "Accounts Manager, Brewton & Co (Swindon)",
//                   color: "blue-500",
//                   rating: 5,
//                   text: "It threw me off when the numbers didn’t look how I expected. Apparently, it forces you to think in accruals. Frustrating at first, but honestly, that’s probably why it works",
//                 },
//                 {
//                   initials: "IO",
//                   name: "Ismail Oladimeji",
//                   role: "Founder, Inspark Studios (Lagos)",
//                   color: "emerald-500",
//                   rating: 5,
//                   text: "When I was asked to join the test users, I said no since I already had a bookkeeper. Turns out he was lobbying to get in himself, now I'm hooked",
//                 },
//                 {
//                   initials: "LA",
//                   name: "Dr. Lawrence A.",
//                   role: "Partner, Lawrence Awe & Co.",
//                   color: "amber-500",
//                   rating: 5,
//                   text: "Finally, a platform that understands what accountants actually need. The automation features are game-changing for our firm.",
//                 },
//               ].map((testimonial, i) => (
//                 <motion.div
//                   key={i}
//                   className="bg-card/30 backdrop-blur-sm border rounded-2xl p-6 shadow-md"
//                   // whileInView={{ y: [20, 0], opacity: [0, 1] }}
//                   // transition={{ duration: 0.5, delay: i * 0.1 }}
//                   // viewport={{ once: true }}
//                   // whileHover={{ y: -5, transition: { duration: 0.2 } }}

//                   initial={{ opacity: 0, y: 10 }}
//                   whileInView={{ opacity: 1, y: 0 }}
//                   transition={{
//                     duration: 0.3,
//                     ease: "easeOut",
//                     delay: i * 0.05,
//                   }}
//                   // viewport={{ once: true }}
//                 >
//                   <div className="flex items-center mb-4">
//                     <div
//                       className={`w-10 h-10 rounded-full bg-gradient-to-br from-${testimonial.color}/20 to-${testimonial.color}/30 flex items-center justify-center text-${testimonial.color} font-medium mr-3 border border-${testimonial.color}/20`}
//                     >
//                       {testimonial.initials}
//                     </div>
//                     <div>
//                       <h4 className="font-medium">{testimonial.name}</h4>
//                       <p className="text-sm text-muted-foreground">
//                         {testimonial.role}
//                       </p>
//                     </div>
//                   </div>
//                   <div className="flex mb-3">
//                     {Array(5)
//                       .fill(0)
//                       .map((_, i) => (
//                         <Star
//                           key={i}
//                           className={`h-4 w-4 ${
//                             i < testimonial.rating
//                               ? "text-amber-500 fill-amber-500"
//                               : "text-muted"
//                           }`}
//                         />
//                       ))}
//                   </div>
//                   <p className="text-muted-foreground">"{testimonial.text}"</p>
//                 </motion.div>
//               ))}
//             </div>
//           </motion.div>
//         </section>

//         {/* Features Detail */}
//         {/* <section className="container mx-auto px-4 py-16">
//           <motion.div
//             initial={{ opacity: 0, y: 40 }}
//             whileInView={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.7 }}
//             viewport={{ once: true }}
//           >
//             <div className="text-center mb-16">
//               <div className="inline-flex items-center px-3 py-1 mb-4 text-sm font-medium rounded-full bg-amber-500/10 text-amber-500">
//                 <span>Features</span>
//               </div>
//               <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/80">
//                 Everything you need, nothing you don't
//               </h2>
//               <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
//                 Powerful features designed specifically for accounting
//                 professionals and business owners.
//               </p>
//             </div>

//             <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
//               <motion.div
//                 className="order-2 md:order-1"
//                 whileInView={{ x: [-20, 0], opacity: [0, 1] }}
//                 transition={{ duration: 0.5 }}
//                 viewport={{ once: true }}
//               >
//                 <div className="inline-flex items-center px-3 py-1 mb-4 text-sm font-medium rounded-full bg-primary/10 text-primary">
//                   <span>Smart Automation</span>
//                 </div>
//                 <h3 className="text-2xl md:text-3xl font-bold mb-4">
//                   Automate the tedious, focus on what matters
//                 </h3>
//                 <p className="text-muted-foreground mb-6">
//                   Our intelligent automation tools handle reconciliations,
//                   categorization, and routine tasks with minimal input required.
//                 </p>

//                 <ul className="space-y-3">
//                   {[
//                     "Automatic bank transaction categorization",
//                     "Smart invoice matching and processing",
//                     "Recurring transaction detection",
//                     "Anomaly detection and flagging",
//                   ].map((item, i) => (
//                     <motion.li
//                       key={i}
//                       className="flex items-start gap-2"
//                       initial={{ opacity: 0, x: -10 }}
//                       animate={{ opacity: 1, x: 0 }}
//                       transition={{ duration: 0.3, delay: i * 0.1 }}
//                     >
//                       <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
//                       <span>{item}</span>
//                     </motion.li>
//                   ))}
//                 </ul>

//                 <Button className="mt-8 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary">
//                   <span>Learn more</span>
//                   <ChevronRight className="ml-2 h-4 w-4" />
//                 </Button>
//               </motion.div>

//               <motion.div
//                 className="order-1 md:order-2 bg-card/30 backdrop-blur-sm border rounded-2xl p-6 shadow-xl"
//                 whileInView={{ x: [20, 0], opacity: [0, 1] }}
//                 transition={{ duration: 0.5 }}
//                 viewport={{ once: true }}
//               >
//                 <div className="aspect-square rounded-xl bg-background/80 border overflow-hidden flex items-center justify-center">
//                   <motion.div
//                     className="w-4/5 h-4/5 relative"
//                     whileInView={{ rotate: [0, 360] }}
//                     transition={{
//                       duration: 60,
//                       repeat: Number.POSITIVE_INFINITY,
//                       ease: "linear",
//                     }}
//                     viewport={{ once: true }}
//                   >
//                     <div className="absolute inset-0 flex items-center justify-center">
//                       <div className="w-1/2 h-1/2 rounded-full border-4 border-primary/20 flex items-center justify-center">
//                         <div className="w-2/3 h-2/3 rounded-full border-4 border-primary/40"></div>
//                       </div>
//                     </div>
//                     <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-primary rounded-full"></div>
//                     <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-emerald-500 rounded-full"></div>
//                     <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full"></div>
//                     <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-amber-500 rounded-full"></div>
//                   </motion.div>
//                 </div>
//               </motion.div>
//             </div>
//           </motion.div>
//         </section> */}

//         {/* CTA */}
//         <section className="container mx-auto px-4 py-16 md:py-24">
//           <motion.div
//             initial={{ opacity: 0, y: 40 }}
//             whileInView={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.7 }}
//             viewport={{ once: true }}
//             className="bg-gradient-to-r from-primary/10 to-primary/5 backdrop-blur-sm border rounded-3xl p-8 md:p-12 shadow-xl text-center"
//           >
//             <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/80">
//               Ready to simplify your bookkeeping?
//             </h2>
//             <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
//               Join our waitlist today and be among the first to experience the
//               future of financial management.
//             </p>

//             <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
//               <Input
//                 type="email"
//                 placeholder="Enter your email"
//                 className="h-12 border-primary/20 focus-visible:ring-primary"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//               />
//               <Button
//                 size="lg"
//                 className="h-12 px-6 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
//                 onClick={handleJoin}
//               >
//                 <span>Join Waitlist</span>
//                 <ArrowRight className="ml-2 h-4 w-4" />
//               </Button>
//             </div>

//             <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
//               Join 200+ accounting professionals and business owners already on
//               the waitlist
//             </div>
//           </motion.div>
//         </section>
//       </main>

//       <footer className="container mx-auto px-4 py-8 md:py-12">
//         <div className="flex flex-col md:flex-row justify-between items-center border-t pt-8">
//           <div className="flex items-center space-x-2 mb-4 md:mb-0">
//             <div className="bg-gradient-to-br  text-primary rounded-lg">
//               <img src="/icon.svg" alt="" className="h-5 w-5" />
//             </div>
//             <span className="font-semibold">accountable</span>
//           </div>

//           <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mb-4 md:mb-0">
//             <Button variant="link" size="sm">
//               About
//             </Button>

//             <Button variant="link" size="sm">
//               <a href="mailto:support@getaccountable.com"></a> Contact
//             </Button>
//           </div>

//           <div className="text-sm text-muted-foreground">
//             © 2025 Accountable Techserve Ltd.
//           </div>
//         </div>
//       </footer>
//     </div>
//   );
// }
