-- Allow team leaders to remove members from their own team
CREATE POLICY "Leader removes own team members"
ON public.team_members
FOR DELETE
TO authenticated
USING (
  team_id IN (
    SELECT id FROM public.teams WHERE created_by_user_id = auth.uid()
  )
  AND role <> 'team_leader'
);