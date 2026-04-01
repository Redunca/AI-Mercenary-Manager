import { RecruitState } from "./recruit-state.enum";
import { Attributes } from "./attributes.model";

export interface Recruit{
    id: string;
    name: string;
    attributes : Attributes;
    state: RecruitState;
}