import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
        <h1 className="text-2xl font-bold text-foreground">404</h1>
        <p className="text-sm text-muted-foreground mt-1">Page not found</p>
        <Link href="/">
          <button className="mt-4 text-xs text-primary hover:underline" data-testid="link-go-home">Go to Dashboard</button>
        </Link>
      </div>
    </div>
  );
}
