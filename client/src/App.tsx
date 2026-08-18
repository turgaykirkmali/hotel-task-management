import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HotelRequestSystem from "@/pages/HotelRequestSystem";
import AuthPage from "@/pages/auth-page";
import ClosetARPage from "@/pages/closet-ar-page";
import { useEffect, useState } from "react";

// Korumalı Rota Bileşeni
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Kullanıcının kimlik doğrulamasını kontrol et
    const user = localStorage.getItem("user");
    
    if (!user) {
      setIsAuthenticated(false);
      setLocation("/auth");
    } else {
      setIsAuthenticated(true);
    }
  }, [setLocation]);

  // Kimlik doğrulama durumu yüklenirken bekle
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Eğer kullanıcı doğrulanmışsa, bileşeni render et
  if (isAuthenticated) {
    return <Component />;
  }

  // Aksi halde kimlik doğrulama sayfasına yönlendir (useEffect içinde yapılıyor)
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={HotelRequestSystem} />} />
      <Route path="/closet-ar" component={() => <ProtectedRoute component={ClosetARPage} />} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
