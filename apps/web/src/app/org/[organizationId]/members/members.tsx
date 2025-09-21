'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crown, Mail, MoreHorizontal, Shield, User, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@cared/ui/components/alert-dialog'
import { Avatar, AvatarImage } from '@cared/ui/components/avatar'
import { Badge } from '@cared/ui/components/badge'
import { Button } from '@cared/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@cared/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@cared/ui/components/dropdown-menu'
import { Input } from '@cared/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cared/ui/components/select'
import { CircleSpinner } from '@cared/ui/components/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cared/ui/components/table'

import { SearchInput } from '@/components/search-input'
import { SectionTitle } from '@/components/section'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/tabs'
import { useActiveOrganizationId } from '@/hooks/use-active'
import {
  useCancelInvitation,
  useCreateInvitation,
  useInvitations,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from '@/hooks/use-members'
import { useSession } from '@/hooks/use-session'

/**
 * Members component for organization
 * Allows managing organization members (remove, update roles) and invitations
 */
export function Members({ kind }: { kind: 'members' | 'invitations' }) {
  const router = useRouter()

  const { user } = useSession()

  const { activeOrganizationId } = useActiveOrganizationId()

  // Use separate hooks for each functionality
  const members = useMembers(activeOrganizationId)
  const invitations = useInvitations(activeOrganizationId)
  const removeMember = useRemoveMember()
  const updateMemberRole = useUpdateMemberRole()
  const createInvitation = useCreateInvitation()
  const cancelInvitation = useCancelInvitation()

  const pendingInvitations = useMemo(
    () => invitations.filter((inv) => inv.status === 'pending'),
    [invitations],
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  const [memberToDelete, setMemberToDelete] = useState<string | null>(null)
  const [memberToUpdateRole, setMemberToUpdateRole] = useState<{
    id: string
    currentRole: string
    name: string
  } | null>(null)
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member')

  // Loading states for async operations
  const [isInviting, setIsInviting] = useState(false)
  const [isRemovingMember, setIsRemovingMember] = useState(false)
  const [isUpdatingRole, setIsUpdatingRole] = useState(false)
  const [cancelingInvitationId, setCancelingInvitationId] = useState<string | null>(null)

  // Check if current user is owner or admin
  const currentUserMember = members.find((member) => member.user.id === user.id)
  const canManageMembers =
    currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin'

  // Handle create invitation
  const handleCreateInvitation = async () => {
    if (inviteEmail) {
      setIsInviting(true)
      try {
        await createInvitation(activeOrganizationId, inviteEmail)
        setIsInviteDialogOpen(false)
        setInviteEmail('')
        toast.success('Invitation sent successfully')
      } catch (error) {
        console.error('Failed to send invitation:', error)
        toast.error('Failed to send invitation')
      } finally {
        setIsInviting(false)
      }
    }
  }

  // Handle remove member
  const handleRemoveMember = async () => {
    if (memberToDelete) {
      setIsRemovingMember(true)
      try {
        await removeMember(activeOrganizationId, memberToDelete)
        setMemberToDelete(null)
        toast.success('Member removed successfully')
      } catch (error) {
        console.error('Failed to remove member:', error)
        toast.error('Failed to remove member')
      } finally {
        setIsRemovingMember(false)
      }
    }
  }

  // Handle update member role
  const handleUpdateMemberRole = async () => {
    if (memberToUpdateRole) {
      setIsUpdatingRole(true)
      try {
        await updateMemberRole(activeOrganizationId, memberToUpdateRole.id, newRole)
        setMemberToUpdateRole(null)
        setNewRole('member')
        toast.success('Member role updated successfully')
      } catch (error) {
        console.error('Failed to update member role:', error)
        toast.error('Failed to update member role')
      } finally {
        setIsUpdatingRole(false)
      }
    }
  }

  // Handle cancel invitation
  const handleCancelInvitation = async (invitationId: string) => {
    setCancelingInvitationId(invitationId)
    try {
      await cancelInvitation(activeOrganizationId, invitationId)
      toast.success('Invitation canceled successfully')
    } catch (error) {
      console.error('Failed to cancel invitation:', error)
      toast.error('Failed to cancel invitation')
    } finally {
      setCancelingInvitationId(null)
    }
  }

  // Filter members based on search query
  const filteredMembers = members.filter((member) => {
    if (!searchQuery) return true

    return (
      member.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.user.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  // Get role icon and variant
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-3 w-3" />
      case 'admin':
        return <Shield className="h-3 w-3" />
      default:
        return <User className="h-3 w-3" />
    }
  }

  const getRoleVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default'
      case 'admin':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  return (
    <>
      <SectionTitle title="Members" description="Manage members of your organization" />

      {/* Search and invite controls - moved outside tabs */}
      <div className="flex flex-wrap justify-end items-center gap-2 mb-6">
        <SearchInput
          placeholder="Search members..."
          value={searchQuery}
          onChange={setSearchQuery}
          className="flex-1 max-w-3xs"
        />

        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canManageMembers}>
              <Mail />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Organization Member</DialogTitle>
              <DialogDescription>Send an invitation to join your organization.</DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateInvitation} disabled={!inviteEmail || isInviting}>
                {isInviting ? (
                  <>
                    <CircleSpinner />
                    Sending...
                  </>
                ) : (
                  'Send Invitation'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs for members and invitations */}
      <Tabs
        value={kind}
        onValueChange={(value) => {
          if (value === 'members') {
            router.push('../members')
          } else {
            router.push('./members/invitations')
          }
        }}
        defaultValue="members"
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invitations">Pending Invitations</TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4">
                      {searchQuery ? 'No members found matching your search.' : 'No members found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                            {member.user.image ? (
                              <Avatar className="h-8 w-8 rounded-lg">
                                <AvatarImage src={member.user.image} alt={member.user.name} />
                              </Avatar>
                            ) : (
                              <span className="text-xs font-medium">
                                {member.user.name.slice(0, 2)}
                              </span>
                            )}
                          </div>
                          <div>
                            <div>{member.user.name}</div>
                            <div className="text-xs text-muted-foreground">{member.user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleVariant(member.role)}>
                          <div className="flex items-center gap-1">
                            {getRoleIcon(member.role)}
                            {member.role === 'owner'
                              ? 'Owner'
                              : member.role === 'admin'
                                ? 'Admin'
                                : 'Member'}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {new Date(member.createdAt).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        {canManageMembers && member.role !== 'owner' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  setMemberToUpdateRole({
                                    id: member.id,
                                    currentRole: member.role,
                                    name: member.user.name,
                                  })
                                }
                              >
                                Change Role
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setMemberToDelete(member.id)}
                                className="text-destructive"
                              >
                                Remove Member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {!canManageMembers && (
            <p className="text-sm text-muted-foreground">
              Only organization owners and admins can manage members.
            </p>
          )}
        </TabsContent>

        {/* Invitations Tab */}
        <TabsContent value="invitations" className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      No pending invitations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingInvitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>{invitation.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {invitation.role === 'owner'
                            ? 'Owner'
                            : invitation.role === 'admin'
                              ? 'Admin'
                              : 'Member'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={invitation.status === 'pending' ? 'default' : 'secondary'}>
                          {invitation.status === 'pending' ? 'Pending' : invitation.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {new Date(invitation.expiresAt).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        {invitation.status === 'pending' && canManageMembers && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelInvitation(invitation.id)}
                            disabled={cancelingInvitationId === invitation.id}
                          >
                            {cancelingInvitationId === invitation.id ? <CircleSpinner /> : <X />}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Remove Member Dialog */}
      <AlertDialog
        open={!!memberToDelete}
        onOpenChange={(open) => {
          if (!open) setMemberToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member from the organization? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRemovingMember}
            >
              {isRemovingMember ? (
                <>
                  <CircleSpinner />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Member Role Dialog */}
      <Dialog
        open={!!memberToUpdateRole}
        onOpenChange={(open) => {
          if (!open) {
            setMemberToUpdateRole(null)
            setNewRole('member')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Member Role</DialogTitle>
            <DialogDescription>Change the role for {memberToUpdateRole?.name}.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'member')}>
              <SelectTrigger>
                <SelectValue placeholder="Select new role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMemberToUpdateRole(null)
                setNewRole('member')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateMemberRole} disabled={isUpdatingRole}>
              {isUpdatingRole ? (
                <>
                  <CircleSpinner />
                  Updating...
                </>
              ) : (
                'Update Role'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
