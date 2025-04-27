import { OnboardingSidebar } from "@/components/SideBar/Sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Outlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

export default function OnboardingLayout() {
  return (
    <SidebarProvider>
      <div className="flex">
        <OnboardingSidebar />
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </SidebarProvider>
  );
}
