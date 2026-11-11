import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	// Survey-sheet shape language: square corners and no soft shadows,
  	// for every rounded-* / shadow-* utility the kit components use.
  	borderRadius: {
  		none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0', full: '0'
  	},
  	// The only shadows are the hard offset ones (no blur), from the
  	// brutalist-undertone tokens in src/index.css.
  	boxShadow: {
  		none: 'none', '2xs': 'none', xs: 'none', sm: 'none', DEFAULT: 'none', md: 'none', lg: 'none', xl: 'none', '2xl': 'none', inner: 'none',
  		hard: 'var(--shadow-hard)', 'hard-ink': 'var(--shadow-hard-ink)', 'hard-deep': 'var(--shadow-hard-deep)'
  	},
  	extend: {
  		// One serif (Literata) for reading and headings, Fragment Mono for
  		// code/data/labels, Silkscreen only for tiny eyebrows and the wordmark.
  		fontFamily: {
  			display: ['Literata', 'Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
  			body: ['Literata', 'Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
  			sans: ['Literata', 'Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
  			serif: ['Literata', 'Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
  			mono: ['Fragment Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
  			pixel: ['Silkscreen', 'Courier New', 'monospace']
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			// --accent itself is the hex accent used by plain CSS; the kit's
  			// HSL triplet lives under --ui-accent so opacity modifiers work.
  			accent: {
  				DEFAULT: 'hsl(var(--ui-accent))',
  				foreground: 'hsl(var(--ui-accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		// Blunt motion: one sharp ease-out, one three-frame step, two short durations.
  		transitionTimingFunction: {
  			blunt: 'var(--ease-blunt)',
  			step: 'var(--ease-step)'
  		},
  		transitionDuration: {
  			snap: 'var(--dur-snap)',
  			blunt: 'var(--dur-blunt)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			},
  			'cursor-enter': {
  				from: { transform: 'scale(0)', opacity: '0' },
  				to: { transform: 'scale(1)', opacity: '1' }
  			},
  			'fade-up': {
  				from: { opacity: '0', transform: 'translateY(8px)' },
  				to: { opacity: '1', transform: 'translateY(0)' }
  			},
  		},
  		animation: {
  			'accordion-down': 'accordion-down var(--dur-blunt) var(--ease-blunt)',
  			'accordion-up': 'accordion-up var(--dur-blunt) var(--ease-blunt)',
  			'cursor-enter': 'cursor-enter var(--dur-blunt) var(--ease-blunt) forwards',
  			'fade-up': 'fade-up var(--dur-blunt) var(--ease-step) forwards',
  		},
  	}
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
