'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Loader2, 
  AlertCircle, 
  Edit, 
  Trash2,
  Shield,
  Users,
  FileText,
  MoreVertical,
  Copy,
  Check,
  FileJson,
  ChevronDown,
  ChevronUp,
  Calendar,
  Zap,
  GitBranch,
  CheckCircle2,
  Link
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { getPolicy, getPolicyStats } from '@/lib/authz-api';
import type { Policy, PolicyStats } from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { normalizeEntityAddress, toQualifiedEntityType } from '@/lib/policy-format';

const getRuleDisplayEntity = (rule: any) =>
  toQualifiedEntityType(
    normalizeEntityAddress({
      schemaName: rule?.schemaName,
      entityType: rule?.entityType,
    })
  );

const getRelationDisplayEntity = (relation: any) =>
  toQualifiedEntityType(normalizeEntityAddress(relation?.to));

const renderRelationGrant = (relation: any, key: string, depth = 0) => (
  <Card key={key} className={depth > 0 ? 'ml-4 border-l-2' : ''}>
    <CardContent className="py-3 px-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">When related via</span>
          <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
            {relation.via}
          </code>
          <span className="text-muted-foreground">to</span>
          <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
            {getRelationDisplayEntity(relation)}
          </code>
        </div>

        <div className="text-xs text-muted-foreground">Grant actions:</div>
        <div className="flex flex-wrap gap-1">
          {(relation.actions || []).map((action: string, actionIndex: number) => (
            <Badge key={`${key}-action-${actionIndex}`} variant="secondary" className="text-xs font-mono">
              {action}
            </Badge>
          ))}
        </div>

        {relation.relations && relation.relations.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-xs text-muted-foreground">Nested relations:</div>
            <div className="space-y-2">
              {relation.relations.map((nestedRelation: any, nestedIndex: number) =>
                renderRelationGrant(nestedRelation, `${key}-nested-${nestedIndex}`, depth + 1)
              )}
            </div>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);

const formatRuleSummary = (rule: any) => {
  const actionCount = rule?.actions?.length || 0;
  const directGrantCount = rule?.directGrants?.length || 0;
  const relationCount = rule?.relations?.length || 0;

  const parts: string[] = [`${actionCount} ${actionCount === 1 ? 'action' : 'actions'}`];

  if (directGrantCount > 0) {
    parts.push(`${directGrantCount} direct ${directGrantCount === 1 ? 'grant' : 'grants'}`);
  }

  if (relationCount > 0) {
    parts.push(`${relationCount} relation-based ${relationCount === 1 ? 'grant' : 'grants'}`);
  }

  return parts.join(' • ');
};

function PolicyDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const policyId = searchParams.get('policyId');

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [stats, setStats] = useState<PolicyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [jsonExpanded, setJsonExpanded] = useState(true);
  const [expandedRules, setExpandedRules] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (policyId) {
      loadPolicyDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  const loadPolicyDetails = async () => {
    if (!policyId) return;
    try {
      setLoading(true);
      const [policyData, statsData] = await Promise.all([
        getPolicy(policyId),
        getPolicyStats(policyId).catch(() => null),
      ]);
      setPolicy(policyData);
      setStats(statsData);
      
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load policy details');
    } finally {
      setLoading(false);
    }
  };

  const toggleRuleJson = (ruleIndex: number) => {
    setExpandedRules((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(ruleIndex)) {
        newSet.delete(ruleIndex);
      } else {
        newSet.add(ruleIndex);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Policy not found'}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push('/authz/policies')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Policies
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/authz/policies')}
            className="mt-1"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{policy.name}</h1>
                <div className="flex items-center gap-2 mt-3">
                  <code className="text-xs bg-muted px-2 py-1 rounded border">
                    {policy.id}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(policy.id)}
                    className="h-7 px-2"
                  >
                    {copiedId ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            {policy.description && (
              <p className="text-muted-foreground max-w-2xl">{policy.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/authz/policies/edit?policyId=${policy.id}`)}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/authz/policies/edit?policyId=${policy.id}`)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Policy
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Policy
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          {stats && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Rules</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.ruleCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {policy.rules.length === 1 ? 'rule' : 'rules'} defined
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Assigned Principals</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.principalCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.principalCount === 1 ? 'principal has' : 'principals have'} this policy
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Last Modified</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {stats.lastModified ? (
                    <DateDisplay 
                      date={stats.lastModified} 
                      formatString="MMM dd, yyyy"
                      className="text-sm font-medium"
                      highlightExpired={false}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">N/A</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Policy Rules */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Policy Rules
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'} defining permissions and access control
                </p>
              </div>
            </div>

            {policy.rules.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center space-y-3">
                    <div className="flex justify-center">
                      <div className="p-3 rounded-full bg-muted">
                        <Shield className="h-8 w-8 text-muted-foreground" />
                      </div>
                    </div>
                    <div>
                      <p className="font-medium">No rules defined</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        This policy has no rules configured
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {policy.rules.map((rule, index) => {
                  const isExpanded = expandedRules.has(index);
                  const actionCount = rule.actions?.length || 0;
                  const directGrantCount = rule.directGrants?.length || 0;
                  const relationCount = rule.relations?.length || 0;

                  return (
                    <Card key={index} className="overflow-hidden">
                      <CardHeader className="bg-muted/50 pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                              {index + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-base">
                                  {getRuleDisplayEntity(rule)}
                                </CardTitle>
                                <Badge variant="secondary" className="text-xs">
                                  Rule {index + 1}
                                </Badge>
                              </div>
                              <CardDescription className="text-xs mt-0.5">
                                {formatRuleSummary(rule)}
                              </CardDescription>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRuleJson(index)}
                            className="gap-2"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="h-4 w-4" />
                                Hide JSON
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-4 w-4" />
                                Show JSON
                              </>
                            )}
                          </Button>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="pt-4">
                        <div className="space-y-4">
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <div className="text-sm font-medium">At a glance</div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {getRuleDisplayEntity(rule)} grants {actionCount} {actionCount === 1 ? 'action' : 'actions'}
                              {directGrantCount > 0 && ` through ${directGrantCount} direct ${directGrantCount === 1 ? 'grant' : 'grants'}`}
                              {directGrantCount > 0 && relationCount > 0 && ' and'}
                              {relationCount > 0 && ` through ${relationCount} relation-based ${relationCount === 1 ? 'grant' : 'grants'}`}
                              .
                            </p>
                          </div>

                          {/* Actions Section */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Zap className="h-4 w-4" />
                              <span>Actions</span>
                              <Badge variant="outline" className="text-xs">
                                {actionCount}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pl-6">
                              {rule.actions?.map((action, actionIndex) => (
                                <Badge key={actionIndex} variant="secondary" className="text-xs font-mono">
                                  {action}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {/* Direct Grants Section */}
                          {rule.directGrants && rule.directGrants.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>Direct Grants</span>
                                <Badge variant="outline" className="text-xs">
                                  {rule.directGrants.length}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pl-6">
                                {rule.directGrants.map((grant, grantIndex) => (
                                  <Badge key={grantIndex} variant="secondary" className="text-xs font-mono">
                                    {grant}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Relations Section */}
                          {rule.relations && rule.relations.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <GitBranch className="h-4 w-4" />
                                <span>Relation-based Grants</span>
                                <Badge variant="outline" className="text-xs">
                                  {rule.relations.length}
                                </Badge>
                              </div>
                              <div className="space-y-2 pl-6">
                                {rule.relations.map((relation, relIndex) => (
                                  renderRelationGrant(relation, `${index}-${relIndex}`)
                                ))}
                              </div>
                            </div>
                          )}

                          {/* JSON View */}
                          {isExpanded && (
                            <div className="pt-4 border-t">
                              <div className="flex items-center gap-2 mb-3">
                                <FileJson className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Rule Definition</span>
                              </div>
                              <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[400px] text-xs font-mono">
                                {JSON.stringify(rule, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Raw JSON Tab */}
        <TabsContent value="raw">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileJson className="h-5 w-5" />
                    Complete Policy Definition
                  </CardTitle>
                  <CardDescription>
                    Raw JSON representation of this policy
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setJsonExpanded(!jsonExpanded)}
                  className="flex items-center gap-2"
                >
                  {jsonExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Expand
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {jsonExpanded && (
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px] text-xs">
                  {JSON.stringify(policy, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PolicyDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PolicyDetailsContent />
    </Suspense>
  );
}
