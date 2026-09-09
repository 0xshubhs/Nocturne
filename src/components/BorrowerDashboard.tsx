"use client";

// defi1 — the borrower view: what you hold, what it scores, what you can take.

import { useDemo } from "@/lib/demo/use-demo";
import { AttestationInbox } from "./AttestationInbox";
import { BorrowForm } from "./BorrowForm";
import { LinkExternalWallet } from "./LinkExternalWallet";
import { LoanCard } from "./LoanCard";
import { ScoreCard } from "./ScoreCard";

export function BorrowerDashboard() {
  const { persona } = useDemo();

  return (
    <div className="flex flex-col gap-5">
      <AttestationInbox />
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="flex flex-col gap-5">
          <ScoreCard />
          <LinkExternalWallet />
        </div>
        <div className="flex flex-col gap-5">
          {/* Keyed so each borrower gets their own tier and amount. */}
          <BorrowForm key={persona.id} />
          <LoanCard />
        </div>
      </div>
    </div>
  );
}
