
"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, PackagePlus, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

const ActionCard: React.FC<ActionCardProps> = ({ title, description, href, icon: Icon }) => {
    const router = useRouter();

    return (
        <Card 
            className="group hover:border-primary transition-colors cursor-pointer flex flex-col"
            onClick={() => router.push(href)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push(href); }}
            tabIndex={0}
        >
            <CardHeader className="flex-row items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-md">
                    <Icon className="h-8 w-8 text-primary"/>
                </div>
                <div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="flex-grow flex items-end justify-end">
                <Button variant="ghost" size="sm" className="text-primary group-hover:underline">
                    Go to Page <ArrowRight className="ml-2 h-4 w-4"/>
                </Button>
            </CardContent>
        </Card>
    );
};


export default function UpdatesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Device Updates</h1>
      <p className="text-muted-foreground mb-6">Manage firmware and software update packs, and orchestrate rollouts to your managed devices.</p>
      
      <div className="grid md:grid-cols-2 gap-6">
        <ActionCard
            title="Manage Update Packs"
            description="Create, view, and manage firmware or software update packages (.swu files) for your devices."
            href="/updates/create_update"
            icon={PackagePlus}
        />
        <ActionCard
            title="Launch Updates"
            description="Define rollout strategies and launch updates to your fleet of devices."
            href="/updates/launch_update"
            icon={Rocket}
        />
      </div>
    </div>
  );
}
