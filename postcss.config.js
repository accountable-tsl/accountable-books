import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import postcssNested from "postcss-nested";

const config = {
  plugins: [tailwindcss(), autoprefixer(), postcssNested()],
};

export default config;
