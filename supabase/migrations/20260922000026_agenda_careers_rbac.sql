-- Agenda and careers portal now participate in the same routine/permission catalog as the other tenant modules.
-- Existing organizations already had both surfaces available in the UI, so keep that behavior while making access explicit.
update public.tenants
   set enabled_routines = enabled_routines || array['agenda']
 where not ('agenda' = any(enabled_routines));

update public.tenants
   set enabled_routines = enabled_routines || array['careers']
 where not ('careers' = any(enabled_routines));
