"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="welcome">
      <h1>This page couldn’t open.</h1>
      <p>Your saved pages are still in your notebook.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
