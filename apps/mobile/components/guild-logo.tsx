import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

const heroLogo = require('../assets/guild-logo-hero.png');
const markLogo = require('../assets/guild-mark.png');

type Props = {
  size?: number;
  variant?: 'hero' | 'mark';
  style?: StyleProp<ImageStyle>;
};

/** Canonical Guild brand mark for splash, login, and home. */
export function GuildLogo({ size = 160, variant = 'hero', style }: Props) {
  return (
    <Image
      source={variant === 'mark' ? markLogo : heroLogo}
      style={[styles.logo, { width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityLabel="The Guild"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    alignSelf: 'center',
  },
});
