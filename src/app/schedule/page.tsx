"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { formatMonthId } from "@/lib/utils/dateCalc";
import { LAUNCH_YEAR, LAUNCH_MONTH } from "@/lib/utils/constants";

export default function SchedulePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    if (!loading && user) {
      const now = new Date();
      let y = now.getFullYear();
      let m = now.getMonth() + 1;
      if (y < LAUNCH_YEAR || (y === LAUNCH_YEAR && m < LAUNCH_MONTH)) {
        y = LAUNCH_YEAR;
        m = LAUNCH_MONTH;
      }
      const monthId = formatMonthId(y, m);
      router.push(`/schedule/${monthId}`);
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  );
}
