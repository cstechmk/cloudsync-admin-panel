import { AdminUser, getProviderInfo } from "@/lib/constants";
import { Mail } from "lucide-react";

const IDENTITY_PROVIDERS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  google: { label: "Google ID", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  gmail:  { label: "Google ID", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  email:  { label: "Google ID", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  apple:  { label: "Apple ID",  color: "text-slate-700", bg: "bg-slate-100", border: "border-slate-300/60" },
};

export function ProviderIcons({ user }: { user: AdminUser }) {
  const profileKey = user.loginProfile?.toLowerCase() ?? "";
  const identityInfo = IDENTITY_PROVIDERS[profileKey] ?? null;

  // Aggregate unique active sync clouds based on folder settings
  const cloudProviders = new Set<string>();
  if (user.activeSyncCloud) {
    user.activeSyncCloud.split(",").forEach((p) => {
      if (p.toLowerCase().includes("google")) cloudProviders.add("google");
      if (p.toLowerCase().includes("onedrive")) cloudProviders.add("onedrive");
      if (p.toLowerCase().includes("dropbox")) cloudProviders.add("dropbox");
    });
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 border-r border-slate-200/70 pr-3">
        {identityInfo ? (
          <div
            title="Sign-in identity"
            className={`flex items-center gap-1.5 ${identityInfo.bg} px-2 py-1.5 rounded-lg border ${identityInfo.border} text-[0.7rem] font-bold ${identityInfo.color} shadow-sm`}
          >
            <Mail size={12} strokeWidth={2.5} /> {identityInfo.label}
          </div>
        ) : (
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-900/5 shadow-sm" title="Email Login">
            <Mail size={13} strokeWidth={2.5} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from(cloudProviders).length > 0 ? (
          Array.from(cloudProviders).map((p) => {
            const info = getProviderInfo(p);
            const Icon = info.icon;
            return (
              <div
                key={p}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[0.7rem] font-bold shadow-sm transition-transform hover:-translate-y-0.5"
                style={{
                  backgroundColor: `${info.color}14`,
                  borderColor: `${info.color}33`,
                  color: info.color
                }}
                title={info.label}
              >
                <Icon size={12} strokeWidth={2.5} color={info.color} className="opacity-90" />
                <span>{info.label}</span>
              </div>
            );
          })
        ) : (
          <span className="text-[0.65rem] font-bold text-slate-400 bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-200/60 shadow-sm">No Sync Target</span>
        )}
      </div>
    </div>
  );
}
