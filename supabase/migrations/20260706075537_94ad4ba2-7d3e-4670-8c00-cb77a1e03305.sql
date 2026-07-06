
CREATE OR REPLACE FUNCTION public.set_updated_at_greeting_themes()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.greeting_themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'standard'
    CHECK (category IN ('standard','kalas','hogtid','tack','forlat','djurfadder')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 100,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.greeting_themes TO anon, authenticated;
GRANT ALL ON public.greeting_themes TO service_role;

ALTER TABLE public.greeting_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "greeting_themes readable to all"
  ON public.greeting_themes FOR SELECT USING (true);

CREATE POLICY "greeting_themes admin manage"
  ON public.greeting_themes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_greeting_themes_updated_at
  BEFORE UPDATE ON public.greeting_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_greeting_themes();

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS theme_id UUID REFERENCES public.greeting_themes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchases_theme_id_idx ON public.purchases(theme_id);

INSERT INTO public.greeting_themes (slug, name, category, is_default, sort, config) VALUES
('standard', 'Standard', 'standard', true, 10, jsonb_build_object(
  'palette', jsonb_build_object('bg','#0B3D2E','accent','#1E9E6A','soft','#EAF7EE','ink','#0B3D2E','muted','#6E9483'),
  'motif','trees',
  'heading_template','Tack, från ett gemensamt klimat.',
  'eyebrow','DITT TRÄD HAR FÅTT EN PLATS',
  'reveal', jsonb_build_object('confetti', false)
)),
('kalaset', 'KALASET', 'kalas', false, 20, jsonb_build_object(
  'palette', jsonb_build_object('bg','#E63973','accent','#F7B733','soft','#FFF3E0','ink','#4A0E2E','muted','#8A4A6A'),
  'motif','confetti_balloons',
  'heading_template','GRATTIS {recipient_name}!',
  'eyebrow','ETT KLIMATSMART KALAS-PRIS',
  'reveal', jsonb_build_object('confetti', true, 'colors', jsonb_build_array('#E63973','#F7B733','#4ECDC4','#FF6B6B'))
)),
('midnattsskogen', 'MIDNATTSSKOGEN', 'hogtid', false, 30, jsonb_build_object(
  'palette', jsonb_build_object('bg','#0A1128','accent','#F0C674','soft','#1B2845','ink','#F5EFDA','muted','#8B93A8'),
  'motif','stars',
  'heading_template','En hälsning från midnattsskogen',
  'eyebrow','TRÄD SOM SUSAR I NATTEN',
  'reveal', jsonb_build_object('confetti', true, 'colors', jsonb_build_array('#F0C674','#FFFFFF','#8B93A8'))
)),
('djurfadern', 'DJURFADDERN', 'djurfadder', false, 40, jsonb_build_object(
  'palette', jsonb_build_object('bg','#3E2723','accent','#D4A574','soft','#F5E6D3','ink','#3E2723','muted','#8D6E63'),
  'motif','animals',
  'heading_template','Du är fadder till skogens djur',
  'eyebrow','FADDERSKAP · WEFOREST',
  'reveal', jsonb_build_object('confetti', true, 'colors', jsonb_build_array('#D4A574','#8D6E63','#3E2723'))
)),
('vintergavan', 'VINTERGÅVAN', 'hogtid', false, 50, jsonb_build_object(
  'palette', jsonb_build_object('bg','#1A3A52','accent','#E8F1F8','soft','#F0F7FC','ink','#1A3A52','muted','#5A7A94'),
  'motif','snowflakes',
  'heading_template','En vintergåva som växer',
  'eyebrow','GOD JUL FRÅN SKOGEN',
  'reveal', jsonb_build_object('confetti', true, 'colors', jsonb_build_array('#FFFFFF','#E8F1F8','#5A7A94'))
)),
('tack', 'TACK', 'tack', false, 60, jsonb_build_object(
  'palette', jsonb_build_object('bg','#2D5F3F','accent','#F4C24D','soft','#F6F1E3','ink','#2D5F3F','muted','#7A8B7E'),
  'motif','wreath',
  'heading_template','Ett stort tack — i trädform',
  'eyebrow','TACKSAMHET SOM VÄXER',
  'reveal', jsonb_build_object('confetti', true, 'colors', jsonb_build_array('#F4C24D','#2D5F3F','#F6F1E3'))
));
