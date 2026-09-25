import Link from "next/link";
import { Lost } from "@/components/illustrations";
import { Doubtling } from "@/components/mascots";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="relative mx-auto mt-10 max-w-xl overflow-hidden">
      <CardContent className="relative grid place-items-center gap-2 px-5 py-10 text-center">
        <div className="flex items-end justify-center gap-2">
          <div className="w-40 text-muted-foreground">
            <Lost label="A dashed arch with its checkpoint wandering off" />
          </div>
          <div aria-hidden="true" className="mascot-bob -ml-10 mb-1 text-muted-foreground/80">
            <Doubtling size={64} mood="curious" />
          </div>
        </div>
        <p className="eyebrow mt-2">404 — no route</p>
        <CardTitle className="font-tsj-display text-2xl">No verdict here.</CardTitle>
        <CardDescription>This path does not exist on the gateway. The console and docs are one click away.</CardDescription>
        <p className="mt-2 flex flex-wrap justify-center gap-2.5">
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/console">Open console</Link>
          </Button>
        </p>
      </CardContent>
    </Card>
  );
}
