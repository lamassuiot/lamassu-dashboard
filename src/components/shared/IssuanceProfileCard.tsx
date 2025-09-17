
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Fingerprint, BookText, KeyRound, ShieldCheck, Scale, Edit, Trash2, Eye } from "lucide-react";
import type { ApiSigningProfile } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { MetadataViewerModal } from './MetadataViewerModal';

const DetailRow: React.FC<{ icon: React.ElementType, label: string, value: string | React.ReactNode }> = ({ icon: Icon, label, value }) => (
  <div className="flex items-start space-x-2 py-1">
    <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {typeof value === 'string' ? <p className="text-sm text-foreground">{value}</p> : value}
    </div>
  </div>
);

interface IssuanceProfileCardProps {
  profile: ApiSigningProfile;
  className?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const IssuanceProfileCard: React.FC<IssuanceProfileCardProps> = ({ profile, className, onEdit, onDelete }) => {
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const allowedKeyTypes = [];
  if (profile.crypto_enforcement?.allow_rsa_keys) allowedKeyTypes.push('RSA');
  if (profile.crypto_enforcement?.allow_ecdsa_keys) allowedKeyTypes.push('ECDSA');

  let subjectPolicy = 'Honors Subject DN from CSR.';
  if (!profile.honor_subject) {
      const overrides = Object.entries(profile.subject || {})
          .filter(([, value]) => value)
          .map(([key, value]) => `${key.substring(0,2).toUpperCase()}=${value}`)
          .join(', ');
      subjectPolicy = `Overrides subject with: ${overrides || 'No specific overrides defined'}`;
  }

  let extensionsPolicy = '';
  if (profile.honor_key_usage) {
      extensionsPolicy += 'Honors Key Usage from CSR. ';
  } else {
      extensionsPolicy += `Enforces KU: ${profile.key_usage?.join(', ') || 'None'}. `;
  }
  if (profile.honor_extended_key_usages) {
      extensionsPolicy += 'Honors EKU from CSR.';
  } else {
      extensionsPolicy += `Enforces EKU: ${profile.extended_key_usages?.join(', ') || 'None'}.`;
  }

  return (
    <>
      <Card
        className={cn(
          "flex flex-col group shadow-md border border-border hover:border-primary/60 hover:shadow-xl transition-all duration-200 overflow-hidden relative",
          profile.sign_as_ca && "ring-2 ring-primary/30",
          className
        )}
        style={{ minHeight: 320 }}
      >
        <div className="h-2 w-full bg-gradient-to-r from-primary to-primary/60" />
        <CardHeader className="pb-2 pt-4 flex flex-row items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="rounded-md p-2 bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Scale className="h-7 w-7 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg leading-tight">{profile.name}</CardTitle>
              <CardDescription className="text-xs pt-1 text-muted-foreground max-w-xs line-clamp-2">{profile.description}</CardDescription>
            </div>
          </div>
          {profile.sign_as_ca && (
            <Badge variant="default" className="ml-2 text-xs px-2 py-1 bg-green-600/90 text-white">CA</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2 text-sm flex-grow pt-0">
          <DetailRow icon={Clock} label="Validity" value={(() => {
            if (!profile.validity) return "Not specified";
            
            switch (profile.validity.type) {
              case 'Duration':
                return profile.validity.duration ? `Duration: ${profile.validity.duration}` : "Not specified";
              case 'Date':
                return profile.validity.time ? `Until: ${new Date(profile.validity.time).toLocaleDateString()}` : "Not specified";
              case 'Indefinite':
                return "Indefinite";
              default:
                return "Not specified";
            }
          })()} />
          <DetailRow icon={Fingerprint} label="Subject Policy" value={subjectPolicy} />
          <DetailRow icon={BookText} label="Extensions Policy" value={extensionsPolicy} />
          <DetailRow
            icon={KeyRound}
            label="Allowed Key Types"
            value={
              <div className="flex flex-wrap gap-1">
                {allowedKeyTypes.map(kt => (
                  <Badge key={kt} variant="secondary" className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-200">
                    {kt}
                  </Badge>
                ))}
                {allowedKeyTypes.length === 0 && <Badge variant="outline">None</Badge>}
              </div>
            }
          />
           <DetailRow
              icon={ShieldCheck}
              label="Can Sign as CA"
              value={<Badge variant={profile.sign_as_ca ? "default" : "secondary"}>{profile.sign_as_ca ? 'Yes' : 'No'}</Badge>}
           />
        </CardContent>
        {onEdit && onDelete && (
          <CardFooter className="border-t pt-2 pb-2 bg-muted/30 flex justify-end gap-2 min-h-0">
            <Button
              variant="outline"
              size="sm"
              className="mr-auto"
              onClick={() => setIsDetailsModalOpen(true)}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5"/> View Raw
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="group-hover:border-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5"/> Delete
            </Button>
            <Button
              variant="default"
              size="sm"
              className="group-hover:bg-primary/90"
              onClick={onEdit}
            >
              <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          </CardFooter>
        )}
      </Card>
      <MetadataViewerModal
        isOpen={isDetailsModalOpen}
        onOpenChange={setIsDetailsModalOpen}
        title={`Raw Profile Data: ${profile.name}`}
        data={profile}
        isEditable={false}
      />
    </>
  );
};
