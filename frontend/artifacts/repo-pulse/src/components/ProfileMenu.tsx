import { useState } from "react";
import { useLocation } from "wouter";
import { Settings2, LogOut, ImageUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/use-settings";
import { Avatar } from "@/lib/avatars";
import { AvatarPicker } from "@/components/AvatarButton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// Top-right account menu: change picture, Settings, and a confirmed Log out.
export default function ProfileMenu() {
  const { user, logout } = useAuth();
  const { data: settings } = useSettings();
  const [, navigate] = useLocation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded-full ring-0 transition-shadow hover:ring-2 hover:ring-emerald-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            title="Account"
            data-testid="button-profile-menu"
          >
            <Avatar avatar={settings?.avatar ?? ""} name={user?.name} size={32} />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate text-sm font-medium text-foreground">{user?.name ?? "—"}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{user?.email ?? ""}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPickerOpen(true)}>
            <ImageUp className="mr-2 h-4 w-4" /> Change picture
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/settings")}>
            <Settings2 className="mr-2 h-4 w-4" /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            className="text-red-400 focus:text-red-400"
            data-testid="menu-logout"
          >
            <LogOut className="mr-2 h-4 w-4" /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AvatarPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign back in to access your repositories and walkthroughs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={logout}
              className="bg-red-500 text-white hover:bg-red-400"
              data-testid="confirm-logout"
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
