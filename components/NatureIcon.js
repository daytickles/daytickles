import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { TICKLE_NATURE_ICONS } from '../lib/theme';

// Single render point for tickle_nature icons -- TICKLE_NATURE_ICONS
// (lib/theme.js) stores { library, name } per nature since "given"
// reaches into MaterialCommunityIcons for a glyph Ionicons doesn't
// have, and Jot (day_journal) uses Feather's outline quill; every call
// site renders through here instead of a raw <Ionicons name={...}>, so
// that library switch stays in one place rather than repeated at each
// of the 6+ places a nature icon appears.
export default function NatureIcon({ nature, size, color, style }) {
  const spec = TICKLE_NATURE_ICONS[nature];
  if (!spec) return null;

  const IconComponent = spec.library === 'material-community'
    ? MaterialCommunityIcons
    : spec.library === 'feather'
      ? Feather
      : Ionicons;
  return <IconComponent name={spec.name} size={size} color={color} style={style} />;
}
