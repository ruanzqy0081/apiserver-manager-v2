import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Check, Clock, Copy, Key, MoreVertical, Pause, Play, Plus, RefreshCw, Trash2, Tag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Keys() {
  const utils = trpc.useUtils();
  const { data: packages } = trpc.packages.list.useQuery();
  const { data: aliases } = trpc.keys.listAliases.useQuery();
  const [selectedPackage, setSelectedPackage] = useState<string>("all");
  const { data: keys, isLoading } = trpc.keys.list.useQuery(
    selectedPackage !== "all" ? { packageId: Number(selectedPackage) } : {}
  );

  const generateMut = trpc.keys.generate.useMutation({ onSuccess: (data) => { utils.keys.list.invalidate(); toast.success(`${data.keys.length} key(s) gerada(s)!`); setShowGenerate(false); } });
  const activateMut = trpc.keys.activate.useMutation({ onSuccess: () => { utils.keys.list.invalidate(); toast.success("Key ativada!"); } });
  const revokeMut = trpc.keys.revoke.useMutation({ onSuccess: () => { utils.keys.list.invalidate(); toast.success("Key revogada!"); } });
  const pauseMut = trpc.keys.pause.useMutation({ onSuccess: () => { utils.keys.list.invalidate(); toast.success("Key pausada!"); } });
  const extendMut = trpc.keys.extend.useMutation({ onSuccess: () => { utils.keys.list.invalidate(); toast.success("Key estendida!"); } });
  const createAliasMut = trpc.keys.createAlias.useMutation({ onSuccess: () => { utils.keys.listAliases.invalidate(); toast.success("Alias criado!"); setAliasInput(""); } });
  const deleteAliasMut = trpc.keys.deleteAlias.useMutation({ onSuccess: () => { utils.keys.listAliases.invalidate(); toast.success("Alias removido!"); } });

  const [showGenerate, setShowGenerate] = useState(false);
  const [showAliases, setShowAliases] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [genForm, setGenForm] = useState({ packageId: "", duration: "month" as "day" | "week" | "month" | "year", alias: "", quantity: 1, note: "" });
  const [copiedKey, setCopiedKey] = useState<number | null>(null);

  const copyKey = (value: string, id: number) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success("Key copiada!");
  };

  const statusColors: Record<string, string> = {
    active: "status-active", inactive: "status-inactive", expired: "status-expired",
    revoked: "status-revoked", paused: "status-paused",
  };
  const statusLabels: Record<string, string> = {
    active: "Ativa", inactive: "Inativa", expired: "Expirada", revoked: "Revogada", paused: "Pausada",
  };
  const durationLabels: Record<string, string> = { day: "1 Dia", week: "1 Semana", month: "1 Mês", year: "1 Ano" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">Gere e gerencie suas chaves de acesso</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowAliases(true)} className="gap-2">
            <Tag className="h-4 w-4" /> Aliases
          </Button>
          <Button onClick={() => setShowGenerate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Gerar Keys
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={selectedPackage} onValueChange={setSelectedPackage}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filtrar por package" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os packages</SelectItem>
            {packages?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">{keys?.length ?? 0} keys</Badge>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : !keys?.length ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Key className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Nenhuma key encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">Gere suas primeiras keys de acesso</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs text-muted-foreground">Key</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Duração</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Ativada em</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Expira em</TableHead>
                    <TableHead className="text-xs text-muted-foreground w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id} className="border-border/30 hover:bg-accent/20">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-foreground max-w-[200px] truncate">{key.keyValue}</code>
                          <button onClick={() => copyKey(key.keyValue, key.id)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent transition-colors shrink-0">
                            {copiedKey === key.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{durationLabels[key.duration]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColors[key.status]} text-xs`}>{statusLabels[key.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {key.activatedAt ? new Date(key.activatedAt).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {key.expiresAt ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(key.expiresAt).toLocaleDateString("pt-BR")}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {key.status === "inactive" && (
                              <DropdownMenuItem onClick={() => activateMut.mutate({ id: key.id })}>
                                <Play className="mr-2 h-4 w-4" /> Ativar
                              </DropdownMenuItem>
                            )}
                            {key.status === "active" && (
                              <DropdownMenuItem onClick={() => pauseMut.mutate({ id: key.id })}>
                                <Pause className="mr-2 h-4 w-4" /> Pausar
                              </DropdownMenuItem>
                            )}
                            {key.status === "paused" && (
                              <DropdownMenuItem onClick={() => activateMut.mutate({ id: key.id })}>
                                <Play className="mr-2 h-4 w-4" /> Retomar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => extendMut.mutate({ id: key.id, duration: "month" })}>
                              <RefreshCw className="mr-2 h-4 w-4" /> +1 Mês
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => extendMut.mutate({ id: key.id, duration: "week" })}>
                              <RefreshCw className="mr-2 h-4 w-4" /> +1 Semana
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { if (confirm("Revogar esta key?")) revokeMut.mutate({ id: key.id }); }}>
                              <Trash2 className="mr-2 h-4 w-4" /> Revogar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-primary" /> Gerar Keys</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Package *</Label>
              <Select value={genForm.packageId} onValueChange={(v) => setGenForm({ ...genForm, packageId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione um package" /></SelectTrigger>
                <SelectContent>
                  {packages?.filter((p) => p.status === "active").map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duração</Label>
                <Select value={genForm.duration} onValueChange={(v) => setGenForm({ ...genForm, duration: v as "day" | "week" | "month" | "year" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">1 Dia</SelectItem>
                    <SelectItem value="week">1 Semana</SelectItem>
                    <SelectItem value="month">1 Mês</SelectItem>
                    <SelectItem value="year">1 Ano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input type="number" min={1} max={100} value={genForm.quantity} onChange={(e) => setGenForm({ ...genForm, quantity: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Alias (prefixo)</Label>
              <Select value={genForm.alias} onValueChange={(v) => setGenForm({ ...genForm, alias: v })}>
                <SelectTrigger><SelectValue placeholder="Padrão (APISERVER)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Padrão (APISERVER)</SelectItem>
                  {aliases?.map((a) => (
                    <SelectItem key={a.id} value={a.alias}>{a.alias}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nota (opcional)</Label>
              <Textarea placeholder="Observação sobre estas keys..." value={genForm.note} onChange={(e) => setGenForm({ ...genForm, note: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancelar</Button>
            <Button
              onClick={() => generateMut.mutate({ packageId: Number(genForm.packageId), duration: genForm.duration, alias: (genForm.alias && genForm.alias !== 'default') ? genForm.alias : undefined, quantity: genForm.quantity, note: genForm.note || undefined })}
              disabled={!genForm.packageId || generateMut.isPending}
              className="gap-2"
            >
              {generateMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
              Gerar {genForm.quantity > 1 ? `${genForm.quantity} Keys` : "Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aliases Dialog */}
      <Dialog open={showAliases} onOpenChange={setShowAliases}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary" /> Aliases de Keys</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Crie prefixos personalizados para suas keys (máx. 3). Exemplo: <code className="bg-muted px-1 rounded">FFH4X</code></p>
            <div className="flex gap-2">
              <Input placeholder="Ex: FFH4X" value={aliasInput} onChange={(e) => setAliasInput(e.target.value.toUpperCase())} maxLength={16} className="uppercase" />
              <Button onClick={() => createAliasMut.mutate({ alias: aliasInput })} disabled={!aliasInput || createAliasMut.isPending} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {aliases?.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                  <code className="text-sm font-mono font-semibold text-primary">{a.alias}</code>
                  <button onClick={() => deleteAliasMut.mutate({ id: a.id })} className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {!aliases?.length && <p className="text-xs text-muted-foreground text-center py-4">Nenhum alias criado</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
