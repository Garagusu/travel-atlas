import "./index.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes, useLocation } from "react-router";
import { AppNav } from "@/components/app-nav";
import { MapExplorer } from "@/components/map/explorer";
import { ConfirmProvider } from "@/components/ui/dialog";
import { ToastProvider } from "@/components/ui/toast";
import { loadStore } from "@/lib/store";
import { AlbumPage } from "./pages/albums/album-page";
import { AlbumsPage } from "./pages/albums/albums-page";
import { CitiesPage } from "./pages/cities/cities-page";
import { CityPage } from "./pages/cities/city-page";
import { DashboardPage } from "./pages/dashboard-page";
import { EditEntryPage, NewEntryPage } from "./pages/journal/editor-pages";
import { EntryPage } from "./pages/journal/entry-page";
import { JournalPage } from "./pages/journal/journal-page";
import { NotFound } from "./pages/not-found";
import { PlacesPage } from "./pages/places-page";
import { SharedPage } from "./pages/shared-page";
import { SettingsPage } from "./pages/settings-page";
import { StatePage } from "./pages/states/state-page";
import { TripPage } from "./pages/trips/trip-page";
import { TripsPage } from "./pages/trips/trips-page";
import { WishlistPage } from "./pages/wishlist-page";
import { useTitle } from "./lib/nav";

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function MapHome() {
  useTitle("Travel Atlas");
  return <MapExplorer />;
}

function App() {
  const [state, setState] = useState<"loading" | "ready" | { error: string }>("loading");
  useEffect(() => {
    loadStore().then(
      () => setState("ready"),
      (e) => setState({ error: (e as Error).message }),
    );
  }, []);
  // Shared links open a standalone read-only page; they don't need the journal's storage.
  if (window.location.hash.startsWith("#/s/"))
    return (
      <HashRouter>
        <Routes>
          <Route path="/s/:data" element={<SharedPage />} />
        </Routes>
      </HashRouter>
    );
  if (state === "loading")
    return (
      <div className="flex-1 flex items-center justify-center py-24" role="status" aria-label="Loading">
        <div className="h-6 w-6 rounded-full border-2 border-line-strong border-t-pine animate-spin" />
      </div>
    );
  if (state !== "ready")
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center">
        <h1 className="text-3xl mb-2">The journal couldn&apos;t open</h1>
        <p className="text-ink-soft mb-6">{state.error}. This browser may be blocking site storage (for example in a private window).</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  return (
    <HashRouter>
      <ScrollTop />
      <ToastProvider>
        <ConfirmProvider>
          <AppNav />
          <main className="flex-1 flex flex-col">
            <Routes>
              <Route path="/" element={<MapHome />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/states/:code" element={<StatePage />} />
              <Route path="/cities" element={<CitiesPage />} />
              <Route path="/cities/:id" element={<CityPage />} />
              <Route path="/places" element={<PlacesPage />} />
              <Route path="/trips" element={<TripsPage />} />
              <Route path="/trips/:id" element={<TripPage />} />
              <Route path="/albums" element={<AlbumsPage />} />
              <Route path="/albums/:id" element={<AlbumPage />} />
              <Route path="/journal" element={<JournalPage />} />
              <Route path="/journal/new" element={<NewEntryPage />} />
              <Route path="/journal/:id" element={<EntryPage />} />
              <Route path="/journal/:id/edit" element={<EditEntryPage />} />
              <Route path="/wishlist" element={<WishlistPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </ConfirmProvider>
      </ToastProvider>
    </HashRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
