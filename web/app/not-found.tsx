import Link from "next/link";
import { Doubtling } from "@/components/mascots";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="relative mx-auto mt-10 max-w-xl overflow-hidden">
      <CardContent className="relative grid place-items-center gap-2 px-5 py-10 text-center">
        <img
          src="/dino-404.svg"
          alt="Pixel dinosaur jumping over cacti beneath a giant 404"
          className="w-full max-w-md"
          loading="lazy"
        />
        <div aria-hidden="true" className="mascot-bob mx-auto text-muted-foreground/80">
          <Doubtling size={64} mood="curious" />
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
