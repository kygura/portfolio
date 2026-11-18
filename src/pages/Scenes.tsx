import { useParams } from "react-router-dom";
import Hall from "./scenes/Hall";
import Viewer from "./scenes/Viewer";

/**
 * /scenes is the hall of windows; /scenes/:id is the scene itself. Both live
 * under one route so the page transition treats them as one page, and the
 * viewer stays mounted while you step between scenes.
 */
const Scenes = () => {
  const { id } = useParams();
  return id === undefined ? <Hall /> : <Viewer id={id} />;
};

export default Scenes;
