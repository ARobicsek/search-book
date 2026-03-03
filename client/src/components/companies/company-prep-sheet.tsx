import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { CompanyPrepNote } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { Pencil, Trash2, Check, Plus, ArrowUp, ArrowDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface CompanyPrepSheetProps {
    companyId: number;
}

export function CompanyPrepSheet({ companyId }: CompanyPrepSheetProps) {
    const [prepNotes, setPrepNotes] = useState<CompanyPrepNote[]>([])
    const [showAddPrepForm, setShowAddPrepForm] = useState(false)
    const [newPrepContent, setNewPrepContent] = useState('')
    const [newPrepUrl, setNewPrepUrl] = useState('')
    const [newPrepUrlTitle, setNewPrepUrlTitle] = useState('')
    const [newPrepDate, setNewPrepDate] = useState(new Date().toLocaleDateString('en-CA'))

    const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
    const [editContent, setEditContent] = useState('')
    const [editSaving, setEditSaving] = useState(false)

    useEffect(() => {
        loadPrepNotes()
    }, [companyId])

    function loadPrepNotes() {
        api.get<CompanyPrepNote[]>(`/company-prepnotes?companyId=${companyId}`)
            .then(setPrepNotes)
            .catch(() => { })
    }

    async function addPrepNote() {
        if (!newPrepContent.trim()) return
        try {
            await api.post('/company-prepnotes', {
                content: newPrepContent.trim(),
                url: newPrepUrl.trim(),
                urlTitle: newPrepUrlTitle.trim(),
                date: newPrepDate,
                companyId,
            })
            loadPrepNotes()
            setNewPrepContent('')
            setNewPrepUrl('')
            setNewPrepUrlTitle('')
            setShowAddPrepForm(false)
            toast.success('Prep note added')
        } catch {
            toast.error('Failed to add prep note')
        }
    }

    async function deletePrepNote(noteId: number) {
        if (!confirm('Delete this prep note?')) return
        try {
            await api.delete(`/company-prepnotes/${noteId}`)
            loadPrepNotes()
            toast.success('Prep note deleted')
        } catch {
            toast.error('Failed to delete prep note')
        }
    }

    function startEditNote(note: CompanyPrepNote) {
        setEditingNoteId(note.id)
        setEditContent(note.content)
    }

    function cancelEditNote() {
        setEditingNoteId(null)
        setEditContent('')
    }

    async function saveEditNote(noteId: number) {
        if (!editContent.trim()) return
        setEditSaving(true)
        try {
            await api.put(`/company-prepnotes/${noteId}`, { content: editContent.trim() })
            loadPrepNotes()
            cancelEditNote()
            toast.success('Prep note updated')
        } catch {
            toast.error('Failed to update prep note')
        } finally {
            setEditSaving(false)
        }
    }

    async function movePrepNote(index: number, direction: 'up' | 'down') {
        if (direction === 'up' && index === 0) return
        if (direction === 'down' && index === prepNotes.length - 1) return

        const newNotes = [...prepNotes]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        const temp = newNotes[index]
        newNotes[index] = newNotes[swapIndex]
        newNotes[swapIndex] = temp

        setPrepNotes(newNotes) // Optimistic update

        try {
            await api.post('/company-prepnotes/reorder', {
                noteIds: newNotes.map((n) => n.id)
            })
        } catch {
            toast.error('Failed to reorder notes')
            loadPrepNotes() // Revert on failure
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Research Dossier</CardTitle>
                <p className="text-xs text-muted-foreground">
                    Add company-level research, news, earnings summaries, and other prep material.
                    You can import these into any connected Contact&apos;s prep sheet before a meeting.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Existing prep notes */}
                {prepNotes.length > 0 && (
                    <div className="space-y-3">
                        {prepNotes.map((note, idx) => (
                            <div key={note.id} className="rounded-md border p-3 space-y-2 bg-yellow-50">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs">
                                                {new Date(note.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </Badge>
                                        </div>
                                        {editingNoteId === note.id ? (
                                            <div className="space-y-2">
                                                <Textarea
                                                    value={editContent}
                                                    onChange={(e) => setEditContent(e.target.value)}
                                                    rows={5}
                                                    className="text-sm"
                                                    placeholder="Use **bold**, *italic*, and - bullet points"
                                                />
                                                <p className="text-xs text-muted-foreground">Supports **bold**, *italic*, and - bullet points</p>
                                                <div className="flex gap-1">
                                                    <Button size="sm" variant="default" onClick={() => saveEditNote(note.id)} disabled={editSaving || !editContent.trim()}>
                                                        <Check className="mr-1 h-3 w-3" />
                                                        {editSaving ? 'Saving...' : 'Save'}
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={cancelEditNote}>
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-sm prep-note-markdown">
                                                <ReactMarkdown>{note.content}</ReactMarkdown>
                                            </div>
                                        )}
                                        {note.url && editingNoteId !== note.id && (
                                            <a
                                                href={note.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                            >
                                                {note.urlTitle || note.url}
                                            </a>
                                        )}
                                    </div>
                                    {editingNoteId !== note.id && (
                                        <div className="flex flex-col items-center gap-0.5">
                                            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => movePrepNote(idx, 'up')} disabled={idx === 0}>
                                                <ArrowUp className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => movePrepNote(idx, 'down')} disabled={idx === prepNotes.length - 1}>
                                                <ArrowDown className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => startEditNote(note)}>
                                                <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deletePrepNote(note.id)}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add new prep note */}
                {!showAddPrepForm ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddPrepForm(true)}
                    >
                        <Plus className="mr-1 h-3 w-3" />
                        Add Dossier Note
                    </Button>
                ) : (
                    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label className="text-xs">Date</Label>
                                <Input
                                    type="date"
                                    value={newPrepDate}
                                    onChange={(e) => setNewPrepDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Notes / Thoughts</Label>
                            <Textarea
                                value={newPrepContent}
                                onChange={(e) => setNewPrepContent(e.target.value)}
                                placeholder="Company intelligence, news, summaries..."
                                rows={3}
                            />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label className="text-xs">Link URL (optional)</Label>
                                <Input
                                    value={newPrepUrl}
                                    onChange={(e) => setNewPrepUrl(e.target.value)}
                                    placeholder="https://docs.google.com/..."
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Link Label (optional)</Label>
                                <Input
                                    value={newPrepUrlTitle}
                                    onChange={(e) => setNewPrepUrlTitle(e.target.value)}
                                    placeholder="E.g. Q3 Earnings Script"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" onClick={addPrepNote} disabled={!newPrepContent.trim()}>
                                <Plus className="mr-1 h-3 w-3" />
                                Add Dossier Note
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowAddPrepForm(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
