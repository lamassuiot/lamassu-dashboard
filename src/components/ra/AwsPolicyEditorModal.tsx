
'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import type { AwsPolicy } from './AwsIotIntegrationTab';

const Editor = dynamic(
    () => import('@monaco-editor/react'), 
    { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center bg-muted/30 rounded-md"><Loader2 className="h-8 w-8 animate-spin"/></div> }
)

interface AwsPolicyEditorModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (policy: AwsPolicy) => void;
  existingPolicy?: AwsPolicy;
}

const policyEditorSchema = z.object({
  policy_name: z.string().min(1, 'Policy name is required.'),
  policy_document: z.string().refine((val) => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, { message: 'Policy document must be valid JSON.'}),
});

export const AwsPolicyEditorModal: React.FC<AwsPolicyEditorModalProps> = ({
  isOpen,
  onOpenChange,
  onSave,
  existingPolicy,
}) => {
  const isEditing = !!existingPolicy;

  const form = useForm<AwsPolicy>({
    resolver: zodResolver(policyEditorSchema),
    defaultValues: existingPolicy || {
      policy_name: '',
      policy_document: JSON.stringify({
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": "iot:Connect",
            "Resource": "arn:aws:iot:*:*:client/${iot:Connection.Thing.ThingName}"
          }
        ]
      }, null, 2),
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(existingPolicy || {
        policy_name: '',
        policy_document: JSON.stringify({
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": "iot:Connect",
              "Resource": "arn:aws:iot:*:*:client/${iot:Connection.Thing.ThingName}"
            }
          ]
        }, null, 2),
      });
    }
  }, [isOpen, existingPolicy, form]);

  const handleSubmit = (data: AwsPolicy) => {
    onSave(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} AWS IoT Policy</DialogTitle>
          <DialogDescription>
            Define the policy name and its corresponding JSON document. Use AWS variables like `${'${iot:Connection.Thing.ThingName}'}` as needed.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 flex-grow flex flex-col min-h-[300px]">
            <FormField
              control={form.control}
              name="policy_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Policy Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Lamassu-Default-Policy" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="policy_document"
              render={({ field }) => (
                <FormItem className="flex-grow flex flex-col">
                  <FormLabel>Policy Document</FormLabel>
                  <FormControl className="flex-grow">
                     <div className="border rounded-md overflow-hidden h-full">
                        <Editor
                            height="100%"
                            defaultLanguage="json"
                            value={field.value}
                            onChange={(value) => field.onChange(value || '')}
                            theme="vs-dark"
                            options={{ minimap: { enabled: false }, automaticLayout: true, wordWrap: 'on' }}
                        />
                     </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">{isEditing ? 'Save Changes' : 'Add Policy'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
