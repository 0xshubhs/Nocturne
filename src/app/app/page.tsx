"use client";

import { useCallback, useSyncExternalStore } from "react";
import { AppShell, type Tab } from "@/components/AppShell";
import { BorrowerDashboard } from "@/components/BorrowerDashboard";
import { ExplorerPanel } from "@/components/ExplorerPanel";
import { PoolView } from "@/components/PoolView";
import { DemoProvider } from "@/lib/demo/use-demo";

const TABS: Tab[] = ["borrow", "pool", "explorer"];

function isTab(v: string): v is Tab {
  return (TABS as string[]).includes(v);
}

// The tab lives in the URL hash so a view can be linked to — handy when
// walking someone through the demo. It is external state (the address bar), so
// `useSyncExternalStore` is the right way to read it without a hydration
// mismatch.
function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function hashSnapshot(): Tab {
  const raw = window.location.hash.replace(/^#/, "");
  return isTab(raw) ? raw : "borrow";
}

function serverSnapshot(): Tab {
  return "borrow";
}

export default function Home() {
  const tab = useSyncExternalStore(subscribeHash, hashSnapshot, serverSnapshot);
  const setTab = useCallback((next: Tab) => {
    window.location.hash = next;
  }, []);

  return (
    <DemoProvider>
      <AppShell tab={tab} onTab={setTab}>
        {tab === "borrow" && <BorrowerDashboard />}
        {tab === "pool" && <PoolView />}
        {tab === "explorer" && <ExplorerPanel />}
      </AppShell>
    </DemoProvider>
  );
}
