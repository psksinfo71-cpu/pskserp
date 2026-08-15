'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Profile, Role, Project } from '@/lib/types';

const ACTIVE_PROJECT_KEY = 'active_project_id';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  userProjects: Project[];
  activeProject: Project | null;
  setActiveProjectId: (id: string | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('Failed to load profile:', error.message);
    return null;
  }
  return data as Profile | null;
}

async function fetchUserProjects(userId: string, role: Role | undefined): Promise<Project[]> {
  let projects: Project[] = [];

  if (role === 'super_admin') {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) console.error('Failed to load projects (admin):', error.message);
    projects = (data ?? []) as Project[];
  } else {
    const { data, error } = await supabase
      .from('user_projects')
      .select('project_id, project:projects(*)')
      .eq('user_id', userId);
    if (error) console.error('Failed to load user_projects:', error.message);
    projects = (data ?? [])
      .map((row) => row.project as unknown as Project)
      .filter((p) => p && p.is_active)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return projects;
}

function pickActiveProject(projects: Project[]): string | null {
  if (typeof window === 'undefined') return projects[0]?.id ?? null;
  const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
  const storedValid = stored && projects.some((p) => p.id === stored);
  return storedValid ? stored : (projects[0]?.id ?? null);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);

  const initUser = useCallback(async (userId: string) => {
    const prof = await fetchProfile(userId);
    setProfile(prof);
    const projects = await fetchUserProjects(userId, prof?.role);
    setUserProjects(projects);
    setActiveProjectIdState(pickActiveProject(projects));
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        initUser(data.session.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        if (newSession?.user) {
          await initUser(newSession.user.id);
          await supabase
            .from('profiles')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', newSession.user.id);
        } else {
          setProfile(null);
          setUserProjects([]);
          setActiveProjectIdState(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [initUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUserProjects([]);
    setActiveProjectIdState(null);
    if (typeof window !== 'undefined') localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      const prof = await fetchProfile(session.user.id);
      setProfile(prof);
    }
  }, [session]);

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveProjectIdState(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
      else localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  }, []);

  const activeProject = userProjects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        loading,
        userProjects,
        activeProject,
        setActiveProjectId,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useRole(): Role | null {
  return useAuth().profile?.role ?? null;
}
