import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export const authService = {
  async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  onAuthStateChange(callback: (session: Session | null) => void) {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return subscription;
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { data, error };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  async resetPasswordForEmail(email: string, redirectTo: string) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo }
    );
    return { data, error };
  },

  async updatePassword(newPassword: string) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { data, error };
  },

  async updateProfile(fullName: string) {
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });
    return { data, error };
  },

  async exchangeCodeForSession(code: string) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    return { data, error };
  },

  async verifyRecoveryOtp(tokenHash: string) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    return { data, error };
  },
};
