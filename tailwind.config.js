/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./**/*.{html,js,jsx,ts,tsx,scss}",
    "./src/**/*.{js,jsx,ts,tsx,scss}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#001f3f", // $deep-navy
        secondary: "#0074d9", // $sky-blue
        neutral: "#333333", // $slate-gray

        // Accent Colors
        success: "#2ecc71", // $bright-mint
        cta: "#ff851b", // $sunset-orange

        // Feedback Colors (Error, Warning, Info)
        danger: "#ff4136", // $error-red
        warning: "#ffdc00", // $warning-yellow
        info: "#39cccc", // $info-blue

        text: "#333333",
      },
    },
  },
  plugins: [],
};
