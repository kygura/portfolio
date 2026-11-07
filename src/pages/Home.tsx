import CartographicHero from "../components/CartographicHero";
import HomeIntro from "../components/HomeIntro";

const Home = () => {
  return (
    <div style={{ background: "var(--bg-primary)" }}>
      <CartographicHero />
      <HomeIntro />
    </div>
  );
};

export default Home;
