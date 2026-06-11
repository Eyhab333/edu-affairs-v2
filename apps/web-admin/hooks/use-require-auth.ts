"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";

import { auth } from "@/lib/firebase";

type UseRequireAuthOptions = {
  redirectTo?: string;
};

type UseRequireAuthResult = {
  user: User | null;
  checkingAuth: boolean;
};

export function useRequireAuth(
  options: UseRequireAuthOptions = {}
): UseRequireAuthResult {
  const { redirectTo = "/login" } = options;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setCheckingAuth(false);

      if (!nextUser) {
        router.replace(redirectTo);
      }
    });

    return () => unsub();
  }, [router, redirectTo]);

  return {
    user,
    checkingAuth,
  };
}