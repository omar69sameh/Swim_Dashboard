"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LoadingState from "@/components/ui/LoadingState";

export default function LegacySwimmersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/coach");
  }, [router]);
  return <LoadingState />;
}
