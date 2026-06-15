// Shared resource name mapping — single source of truth
// Used by both the web worker and the main app
const RESOURCE_MAP = {
  'B&B': 'Boards & Beyond',
  'SketchyMicro': 'Sketchy Micro',
  'SketchyPharm': 'Sketchy Pharm',
  'SketchyPath': 'Sketchy Pathology',
  'SketchyAnatomy': 'Sketchy Anatomy',
  'SketchyBiochem': 'Sketchy Biochem',
  'SketchyBiostats/Epidemiology': 'Sketchy Biostats/Epidemiology',
  'SketchyImmunology': 'Sketchy Immunology',
  'SketchyPhysiology': 'Sketchy Physiology',
  'DirtyMedicine': 'Dirty Medicine',
  'FirstAid': 'First Aid',
  'NinjaNerd': 'Ninja Nerd',
  'DivineIntervention': 'Divine Intervention',
  'SketchyFM': 'Sketchy Family Medicine',
  'SketchyIM': 'Sketchy Internal Medicine',
  'SketchyNeurology': 'Sketchy Neurology',
  'SketchyOBGYN': 'Sketchy OBGYN',
  'SketchyPeds': 'Sketchy Pediatrics',
  'SketchyPsych': 'Sketchy Psychiatry',
  'SketchySurgery': 'Sketchy Surgery',
  'Low/HighYield': 'Low/High Yield',
  'USMLERx': 'USMLE Rx',
  'OME': 'OnlineMedEd',
  'OME_banner': 'OnlineMedEd Banner',
  'Resources_by_rotation': 'Resources by Rotation'
};

export function cleanResourceName(raw) {
  return RESOURCE_MAP[raw] || raw;
}

export default RESOURCE_MAP;
