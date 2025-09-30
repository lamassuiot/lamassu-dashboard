// Create a page with a selector for three options: create update, launch update. This should redirect to two pages



"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

export default function UpdatesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Updates</h1>
      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-[400px] grid-cols-2">
          <TabsTrigger value="create">
            <Link href="/updates/create_update">Create Update</Link>
          </TabsTrigger>
          <TabsTrigger value="launch">
            <Link href="/updates/launch_update">Launch Update</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
