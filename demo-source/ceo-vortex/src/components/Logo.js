import { useTheme } from '../theme/ThemeContext'

export default function Logo({ name, alt, width, height, className = '' }) {
  const { isDark } = useTheme()

  return (
    <img
      src={`${process.env.PUBLIC_URL}/assets/logos/${name}.png`}
      alt={alt}
      width={width}
      height={height}
      className={`logo-adapt${isDark ? ' logo-invert' : ''} ${className}`.trim()}
    />
  )
}
