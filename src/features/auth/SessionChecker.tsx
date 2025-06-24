import { fetchSession } from "@/features/auth/api";
import { useCompany } from "@/domains/company/store";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/hooks";
import { useLocation, useNavigate } from "react-router-dom";
import { isPublicRoute } from "@/shared/routes/utils";
import { sessionStore } from "@/features/auth/store";
import { onboardingStatus } from "@/domains/company/types";
import { routes } from "@/shared/routes/routes-old";
import { isDemoCompany } from "@/domains/company/utils";
// import { useCompanySwitch } from "@/features/switchCompany/hooks";

// export function SessionChecker() {
//   const location = useLocation();
//   const {
//     setUser,
//     clearSession,
//     setCheckingSession,
//     setSessionValid,
//     incrementFailedAttempts,
//     resetFailedAttempts,
//   } = useAuth();
//   const { company, companyType, fetchCompany } = useCompany();
//   const navigate = useNavigate();

//   const failedAttempts = sessionStore((s) => s.failedAttempts);
//   const MAX_ATTEMPTS = 3;
//   const isOnboardingPage = location.pathname.includes("/onboarding");
//   const isPublic = isPublicRoute(location.pathname);

//   useEffect(() => {
//     let isMounted = true;
//     const abortController = new AbortController();

//     const validateSession = async () => {
//       try {
//         setCheckingSession(true);
//         if (isOnboardingPage || isPublic) {
//           setCheckingSession(false);
//           return;
//         }
//         const isDemo = company?.id && isDemoCompany(company?.id);
//         if (isDemo) {
//           // Skip validation in demo mode
//           setSessionValid(true);
//           setCheckingSession(false);
//           return;
//         }

//         const res = await fetchSession();
//         if (!res.success || !res.data) {
//           throw new Error(res.message || "Session validation failed");
//         }
//         setUser(res.data.user);
//         setSessionValid(true);
//         resetFailedAttempts();
//         fetchCompany(res.data.company.id);

//         const isDemoCheck = isDemo || isDemoCompany(res.data.company.id);
//         if (
//           res.data.company.onboardingStatus !==
//             onboardingStatus.enum.onboarding_complete &&
//           !isOnboardingPage &&
//           !isPublic &&
//           !isDemoCheck
//         ) {
//           // window.location.replace(
//           //   routes.onboarding.index.buildPath({
//           //     companyId: res.data.company.id,
//           //   })
//           // );
//           const companyId = res.data.company.id;
//           navigate(routes.onboarding.index.buildPath({ companyId }), {
//             replace: true,
//           });
//         }
//       } catch (err) {
//         incrementFailedAttempts();
//         const currentFailedAttempts = sessionStore.getState().failedAttempts;
//         setSessionValid(false);
//         if (currentFailedAttempts + 1 >= MAX_ATTEMPTS) {
//           if (!isPublicRoute(location.pathname)) {
//             clearSession();
//             window.location.replace(routes.login.staticPath);
//           }
//           resetFailedAttempts();
//         }
//       } finally {
//         if (isMounted) setCheckingSession(false); // very important
//       }
//     };

//     validateSession();
//     return () => {
//       isMounted = false;
//       abortController.abort();
//     };
//   }, [location.pathname]);

//   return null;
// }

// export function SessionChecker() {
//   const location = useLocation();
//   const {
//     setUser,
//     clearSession,
//     setCheckingSession,
//     setSessionValid,
//     incrementFailedAttempts,
//     resetFailedAttempts,
//   } = useAuth();
//   const { fetchCompany } = useCompany();
//   const failedAttempts = sessionStore((s) => s.failedAttempts);
//   const MAX_ATTEMPTS = 3;

//   const isOnboardingPage = location.pathname.includes("/onboarding");
//   const isPublic = isPublicRoute(location.pathname);

//   useEffect(() => {
//     const validateSession = async () => {
//       try {
//         if (isOnboardingPage || isPublic) {
//           setCheckingSession(false);
//           return;
//         }

//         setCheckingSession(true);
//         const res = await fetchSession();

//         if (!res.success || !res.data) {
//           throw new Error(res.message || "Session validation failed");
//         }
//         setUser(res.data.user);
//         setSessionValid(true);
//         resetFailedAttempts();
//         fetchCompany(res.data.company.id);

//         const isDemo = isDemoCompany(res.data.company.id);

//         // if (
//         //   res.data.company.onboardingStatus !==
//         //     onboardingStatus.enum.onboarding_complete &&
//         //   !isOnboardingPage &&
//         //   !isPublic &&
//         //   !isDemo
//         // ) {
//         //   window.location.replace(
//         //     routes.onboarding.index.buildPath({
//         //       companyId: res.data.company.id,
//         //     })
//         //   );
//         // }
//       } catch (err) {
//         incrementFailedAttempts();
//         setSessionValid(false);
//         if (failedAttempts + 1 >= MAX_ATTEMPTS) {
//           if (!isPublicRoute(location.pathname)) {
//             clearSession();
//             window.location.replace(routes.login.staticPath);
//           }
//           resetFailedAttempts();
//         }
//       } finally {
//         setCheckingSession(false); // very important
//       }
//     };

//     validateSession();
//   }, [location.pathname]);

//   return null;
// }
